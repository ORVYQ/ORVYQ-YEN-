import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { CaptionLayer } from "./CaptionLayer";
import { EditorialOverlaySpec } from "./EditorialOverlay";
import { OrvyqGraphicSpec } from "./OrvyqGraphic";
import { PrimaryEvidenceSpec } from "./types/evidence";
import { FootageMotion, Scene } from "./Scene";
import { EmphasisCardSpec } from "./EmphasisCard";
import { HookQuestion, HookQuestionSpec } from "./HookQuestion";
import type { CinematicVisualModuleSpec } from "./visual-modules/types";
import assetMap from "./data/asset_map.json";
import captionsData from "./data/captions.json";
import editPlan from "./data/edit_plan.json";

type BaseShot = {
  shot_id: string;
  scene_id: string;
  start_frame: number;
  end_frame: number;
  claim_id?: string;
  visual_role?: string;
  editorial_purpose?: string;
  visual_module?: CinematicVisualModuleSpec | null;
  editorial_overlay?: EditorialOverlaySpec | null;
  emphasis_card?: EmphasisCardSpec | null;
  hook_question?: HookQuestionSpec | null;
  hook_footage?: boolean;
  text_overlay?: string | null;
  transition_in?: string;
  transition_out?: string;
  sound_cue?: string | null;
};

type FootageShot = BaseShot & {
  asset_type: "footage";
  video_asset: string;
  trim_in_sec: number;
  trim_out_sec: number;
  motion_variant?: FootageMotion;
};

type GraphicShot = BaseShot & {
  asset_type: "graphic";
  graphic: OrvyqGraphicSpec;
};

type EvidenceShot = BaseShot & {
  asset_type: "evidence";
  evidence: PrimaryEvidenceSpec;
};

type EditPlan = {
  fps?: number;
  audio_mix_asset?: string;
  opening?: { selected_archetype?: string };
  shots: Array<FootageShot | GraphicShot | EvidenceShot>;
};

type CaptionsFile = {
  captions: Array<{
    caption_id: string;
    scene_id: string;
    start_frame: number;
    end_frame: number;
    text: string;
  }>;
};

export const FactForgeVideo: React.FC = () => {
  const plan = editPlan as unknown as EditPlan;
  const captions = captionsData as unknown as CaptionsFile;
  const audioSrc = plan.audio_mix_asset || assetMap.audio_asset;
  const legacyHookQuestionShot = plan.opening ? null : plan.shots.find((shot) => shot.hook_question);
  const hookEndFrame = plan.shots
    .filter((shot) => shot.hook_footage)
    .reduce((maximum, shot) => Math.max(maximum, shot.end_frame), 0);

  return (
    <AbsoluteFill style={{ backgroundColor: "#05070C" }}>
      <Audio src={staticFile(audioSrc)} />
      {plan.shots.map((shot) => {
        const overlapFrames = shot.start_frame > 0 && ["evidence", "graphic"].includes(shot.asset_type) ? 8 : 0;
        const sequenceFrom = Math.max(0, shot.start_frame - overlapFrames);
        const durationInFrames = Math.max(1, shot.end_frame - sequenceFrom);
        const transitionIn = shot.transition_in || "cut";
        const transitionOut = shot.transition_out || "cut";
        return (
          <Sequence key={shot.shot_id} from={sequenceFrom} durationInFrames={durationInFrames}>
            {shot.asset_type === "graphic" ? (
              <Scene
                assetType="graphic"
                graphic={shot.graphic}
                visualModule={shot.visual_module || null}
                editorialOverlay={shot.editorial_overlay || null}
                durationInFrames={durationInFrames}
                textOverlay={shot.text_overlay || null}
                transitionIn={transitionIn}
                transitionOut={transitionOut}
              />
            ) : shot.asset_type === "evidence" ? (
              <Scene
                assetType="evidence"
                evidence={shot.evidence}
                visualModule={shot.visual_module || null}
                durationInFrames={durationInFrames}
                textOverlay={null}
                transitionIn={transitionIn}
                transitionOut={transitionOut}
              />
            ) : (
              <Scene
                assetType="footage"
                videoSrc={staticFile(shot.video_asset)}
                trimInSec={shot.trim_in_sec}
                trimOutSec={shot.trim_out_sec}
                motionVariant={shot.motion_variant || "hold"}
                visualModule={shot.visual_module || null}
                editorialOverlay={shot.editorial_overlay || null}
                emphasisCard={shot.emphasis_card || null}
                durationInFrames={durationInFrames}
                textOverlay={shot.text_overlay || null}
                transitionIn={transitionIn}
                transitionOut={transitionOut}
              />
            )}
          </Sequence>
        );
      })}
      {legacyHookQuestionShot?.hook_question && hookEndFrame > 0 ? (
        <Sequence from={0} durationInFrames={hookEndFrame}>
          <HookQuestion spec={legacyHookQuestionShot.hook_question} durationInFrames={hookEndFrame} />
        </Sequence>
      ) : null}
      <CaptionLayer captions={captions.captions} />
    </AbsoluteFill>
  );
};
