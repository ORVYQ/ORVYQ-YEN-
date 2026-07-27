#!/usr/bin/env node
import path from "node:path";
import { promises as fs } from "node:fs";
import { projectDir, readJson, writeJsonAtomic, parseArgs, printJson } from "./lib/fs-utils.mjs";
import { command, extractLoudnorm, measureLoudness, normalizeFilter } from "./lib/orvyq-loudness.mjs";
import { DEFAULT_PAUSE_RISE_DB, DEFAULT_PAUSE_RISE_RAMP_SECONDS, buildPauseRiseFfmpegExpr } from "./lib/orvyq-music-envelope.mjs";

const PROJECT_ID = process.env.ORVYQ_PROJECT_ID || null;
const MINIMUM_ACCEPTABLE_LRA = 4.5;
const TARGET_LRA = 7;
const VOICE_COMPRESSOR_THRESHOLD_DB = -6;
const VOICE_COMPRESSOR_RATIO = 1.05;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const round3 = (value) => Math.round(Number(value) * 1000) / 1000;

export function gainForEnergy(energy) {
  return round3(clamp(0.32 + Number(energy || 0) * 0.9, 0.5, 1.0));
}

export function musicGainExpression(cues, outputDuration) {
  const normalized = (cues || [])
    .map((cue) => ({
      start: Math.max(0, Number(cue.start)),
      end: Math.min(outputDuration, Number(cue.end)),
      gainStart: gainForEnergy(cue.energy_start),
      gainEnd: gainForEnergy(cue.energy_end)
    }))
    .filter((cue) => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start);
  if (!normalized.length) return "0.68";
  // Fallback for any t outside every cue window -- in practice this is only
  // the pre-narration motion-hook silence before the first cue's own start
  // (cues fully tile the runtime from there through outputDuration, so
  // there is no analogous gap after the last cue's end). Holding at the
  // FIRST cue's own opening gain is the correct envelope semantics (hold at
  // a ramp's own starting value before it begins); using the LAST cue's
  // closing gain here was a real defect -- it silently played the entire
  // unducked opening hook at whatever gain the film's closing cue happened
  // to end on, regardless of the hook's own intended energy.
  let expression = String(normalized[0].gainStart);
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const cue = normalized[index];
    const span = Math.max(0.001, cue.end - cue.start);
    const ramp = `(${cue.gainStart}+(${cue.gainEnd}-${cue.gainStart})*(t-${cue.start})/${span})`;
    expression = `if(between(t,${cue.start},${cue.end}),${ramp},${expression})`;
  }
  return expression;
}

function sfxInputMap(metadata) {
  const assets = metadata.sfx_assets || [];
  const byCue = new Map();
  for (const asset of assets) {
    if (asset.includes("low_impact")) byCue.set("low_impact", asset);
    else if (asset.includes("tonal_bloom")) byCue.set("tonal_bloom", asset);
    else if (asset.includes("ui_tick")) byCue.set("ui_tick", asset);
  }
  return byCue;
}

function buildSfxGraph(placements, inputIndexByCue) {
  const volumes = { low_impact: 0.45, tonal_bloom: 0.62, ui_tick: 0.52 };
  const byCue = new Map();
  for (const placement of placements || []) {
    if (!inputIndexByCue.has(placement.sfx_id)) continue;
    if (!byCue.has(placement.sfx_id)) byCue.set(placement.sfx_id, []);
    byCue.get(placement.sfx_id).push(placement);
  }
  const filters = [];
  const labels = [];
  for (const [cue, cuePlacements] of byCue) {
    const inputIndex = inputIndexByCue.get(cue);
    const split = cuePlacements.map((_, index) => `${cue}_dynamic_${index}`);
    if (cuePlacements.length > 1) filters.push(`[${inputIndex}:a]asplit=${cuePlacements.length}${split.map((label) => `[${label}]`).join("")}`);
    cuePlacements.forEach((placement, index) => {
      const source = cuePlacements.length > 1 ? `[${split[index]}]` : `[${inputIndex}:a]`;
      const label = `dynamic_sfx_${cue}_${index}`;
      const delay = Math.round(Number(placement.at_seconds) * 1000);
      filters.push(`${source}adelay=${delay}|${delay},volume=${volumes[cue] || 0.45}[${label}]`);
      labels.push(`[${label}]`);
    });
  }
  return { filters, labels };
}

function dynamicFilter({ metadata, cues, inputIndexByCue, loudnorm = null }) {
  const outputDuration = Number(metadata.duration_seconds);
  const headSilence = Number(metadata.head_silence_seconds || 0);
  const pauseWindows = (metadata.pause_windows || []).map((pause) => ({ start: Number(pause.start_seconds), end: Number(pause.end_seconds) }));
  const cueGain = musicGainExpression(cues, outputDuration);
  const pauseRise = pauseWindows.length ? buildPauseRiseFfmpegExpr(pauseWindows, { riseDb: DEFAULT_PAUSE_RISE_DB, rampSeconds: DEFAULT_PAUSE_RISE_RAMP_SECONDS }) : "1";
  const musicGain = `((${cueGain})*(${pauseRise}))`;
  const fadeSeconds = Math.min(Number(metadata.end_card_fade_seconds || 5), outputDuration);
  const fadeStart = Math.max(0, outputDuration - fadeSeconds);
  const { filters: sfxFilters, labels: sfxLabels } = buildSfxGraph(metadata.sfx_placements || [], inputIndexByCue);
  return [
    // The source narration already passed dedicated speech QA and carries the
    // natural paragraph/chapter dynamics that make a long-form documentary
    // breathe. The former -12 dB / 1.25:1 compressor flattened that verified
    // performance enough that even a correctly authored music envelope could
    // not clear the cinematic LRA floor. Keep only very light peak control
    // here; final loudnorm still protects integrated loudness and true peak.
    `[0:a]adelay=${Math.round(headSilence * 1000)}|${Math.round(headSilence * 1000)},apad,atrim=duration=${outputDuration},highpass=f=65,lowpass=f=16000,acompressor=threshold=${VOICE_COMPRESSOR_THRESHOLD_DB}dB:ratio=${VOICE_COMPRESSOR_RATIO}:attack=24:release=280,asplit=2[voice_sc][voice_mix]`,
    `[1:a]atrim=duration=${outputDuration},loudnorm=I=-23:TP=-3:LRA=11,volume='${musicGain}':eval=frame,afade=t=in:st=0:d=2.2,afade=t=out:st=${fadeStart}:d=${fadeSeconds}[music]`,
    `[music][voice_sc]sidechaincompress=threshold=0.035:ratio=2:attack=28:release=780[ducked]`,
    ...sfxFilters,
    `[voice_mix][ducked]${sfxLabels.join("")}amix=inputs=${2 + sfxLabels.length}:normalize=0,${normalizeFilter(loudnorm)},aformat=channel_layouts=stereo[mix]`
  ].join(";");
}

export async function buildDynamicRemix(projectId = PROJECT_ID) {
  const dir = projectDir(projectId);
  const audioDir = path.join(dir, "assets", "audio");
  const metadataPath = path.join(audioDir, "final_mix.metadata.json");
  const metadata = await readJson(metadataPath);
  const cueSheet = await readJson(path.join(dir, "direction", "music_cue_sheet.json"));
  const voice = path.join(dir, metadata.processed_voice_source);
  const music = path.join(dir, metadata.music_asset);
  const finalMix = path.join(dir, metadata.mix_asset);
  const candidateMix = path.join(audioDir, "final_mix.dynamic-candidate.mp3");
  const cueAssets = sfxInputMap(metadata);
  const cuesUsed = [...new Set((metadata.sfx_placements || []).map((placement) => placement.sfx_id))].filter((cue) => cueAssets.has(cue));
  const inputIndexByCue = new Map(cuesUsed.map((cue, index) => [cue, index + 2]));
  const inputs = ["-i", voice, "-stream_loop", "-1", "-i", music, ...cuesUsed.flatMap((cue) => ["-i", path.join(dir, cueAssets.get(cue))])];
  const filterOptions = { metadata, cues: cueSheet.full_cues || [], inputIndexByCue };
  const firstPass = await command("ffmpeg", ["-hide_banner", "-nostats", ...inputs, "-filter_complex", dynamicFilter(filterOptions), "-map", "[mix]", "-t", String(metadata.duration_seconds), "-f", "null", "-"]);
  const analysis = extractLoudnorm(`${firstPass.stdout}\n${firstPass.stderr}`);
  await command("ffmpeg", ["-hide_banner", "-nostats", "-y", ...inputs, "-filter_complex", dynamicFilter({ ...filterOptions, loudnorm: analysis }), "-map", "[mix]", "-t", String(metadata.duration_seconds), "-ac", "2", "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "192k", candidateMix]);
  const measured = await measureLoudness(candidateMix);
  const loudnessRange = Number(measured.input_lra);
  if (!Number.isFinite(loudnessRange) || loudnessRange < MINIMUM_ACCEPTABLE_LRA) {
    await fs.rm(candidateMix, { force: true });
    throw new Error(`Dynamic remix did not reach the minimum ${MINIMUM_ACCEPTABLE_LRA} LU loudness range (measured ${loudnessRange} LU)`);
  }
  await fs.rename(candidateMix, finalMix);
  const sectionGains = (cueSheet.full_cues || []).map((cue) => ({ cue_id: cue.cue_id, gain_start: gainForEnergy(cue.energy_start), gain_end: gainForEnergy(cue.energy_end) }));
  metadata.generated_by = "scripts/orvyq_audio_mix.mjs + scripts/orvyq_dynamic_remix.mjs";
  metadata.target = { ...metadata.target, loudness_range: TARGET_LRA, minimum_acceptable_loudness_range: MINIMUM_ACCEPTABLE_LRA };
  metadata.measured = { integrated_lufs: Number(measured.input_i), true_peak_dbtp: Number(measured.input_tp), loudness_range: loudnessRange };
  metadata.narration_ducking = { ...metadata.narration_ducking, ratio: 2, release_ms: 780, per_section_under_speech_gain: sectionGains.map((section) => section.gain_start) };
  metadata.dynamic_remix = {
    profile: "aperture-cinematic-v1",
    voice_compressor_threshold_db: VOICE_COMPRESSOR_THRESHOLD_DB,
    voice_compressor_ratio: VOICE_COMPRESSOR_RATIO,
    sidechain_ratio: 2,
    sidechain_release_ms: 780,
    section_energy_gains: sectionGains,
    minimum_acceptable_lra: MINIMUM_ACCEPTABLE_LRA
  };
  await writeJsonAtomic(metadataPath, metadata);
  return { measured: metadata.measured, target: metadata.target, dynamic_remix: metadata.dynamic_remix };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  buildDynamicRemix(args["project-id"] || PROJECT_ID)
    .then((result) => printJson({ ok: true, ...result }))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
