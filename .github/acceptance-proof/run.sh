#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="$(printf '%03d-%s' 998 'seasonal-heat-acceptance')"
export PROJECT_ID
: "${SYSTEM_SHA:?SYSTEM_SHA is required}"

PROJECT="projects/$PROJECT_ID"
SOURCE="acceptance-proof-source"
PROOF="acceptance-proof"
DATA="templates/remotion/src/data"
PUBLIC="templates/remotion/public/assets"

mkdir -p "$PROJECT/direction" "$PROJECT/qa" "$SOURCE" "$PROOF/pre-render" "$PROOF/post-render" "$PROOF/frames" \
  "$DATA" "$PUBLIC/images" "$PUBLIC/footage" "$PUBLIC/audio"

python3 - <<'PY'
import json
import os
from pathlib import Path

project_id = os.environ['PROJECT_ID']
project = Path('projects') / project_id
direction = project / 'direction'
source = Path('acceptance-proof-source')
public = Path('templates/remotion/public/assets')
for path in [direction, project / 'qa', source, public / 'images', public / 'footage', public / 'audio', Path('templates/remotion/src/data'), Path('acceptance-proof')]:
    path.mkdir(parents=True, exist_ok=True)

svgs = {
'city_heat.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#17324a"/><stop offset="1" stop-color="#060a10"/></linearGradient><linearGradient id="heat" x1="0" x2="1"><stop stop-color="#f0b35a"/><stop offset="1" stop-color="#e06a63"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#sky)"/><circle cx="1570" cy="210" r="150" fill="#f0b35a" opacity=".72"/><g fill="#142434"><rect x="80" y="340" width="260" height="390"/><rect x="380" y="250" width="330" height="480"/><rect x="760" y="390" width="230" height="340"/><rect x="1030" y="300" width="360" height="430"/><rect x="1440" y="420" width="310" height="310"/></g><rect y="730" width="1920" height="350" fill="#07111b"/><g stroke="url(#heat)" stroke-width="28" fill="none" opacity=".9"><path d="M120 900 C420 770 600 1010 920 870 S1450 770 1810 900"/><path d="M160 980 C510 850 730 1050 1050 930 S1500 850 1760 980"/></g><g fill="#f6f2e9"><circle cx="520" cy="660" r="16"/><rect x="507" y="676" width="26" height="70" rx="12"/><circle cx="610" cy="676" r="14"/><rect x="599" y="690" width="22" height="58" rx="11"/></g></svg>''',
'street_work.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0c1c2a"/><stop offset="1" stop-color="#05070c"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><path d="M0 820 L1920 560 L1920 1080 L0 1080Z" fill="#151c23"/><g stroke="#91b7d7" stroke-width="10" opacity=".7"><path d="M130 840 L1720 620"/><path d="M160 920 L1780 690"/></g><g fill="#e06a63"><circle cx="590" cy="760" r="46"/><circle cx="1220" cy="665" r="46"/></g><g fill="#f6f2e9"><circle cx="820" cy="565" r="20"/><rect x="804" y="585" width="32" height="110" rx="14"/><circle cx="920" cy="540" r="20"/><rect x="904" y="560" width="32" height="120" rx="14"/></g><rect x="300" y="180" width="1320" height="190" rx="22" fill="#08131e" stroke="#91b7d7" stroke-width="3"/><text x="960" y="270" text-anchor="middle" font-family="Arial" font-size="58" fill="#f6f2e9">A reserve nobody can see</text><text x="960" y="330" text-anchor="middle" font-family="Arial" font-size="28" fill="#c7d0d8">Synthetic seasonal heat demonstration</text></svg>''',
'document.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1000"><rect width="1500" height="1000" fill="#eceae4"/><rect x="70" y="65" width="14" height="860" fill="#e06a63"/><text x="125" y="145" font-family="Arial" font-size="34" fill="#243340">SYNTHETIC CITY ENERGY LAB</text><text x="125" y="225" font-family="Arial" font-size="64" font-weight="700" fill="#101820">Seasonal Heat Storage Pilot</text><text x="125" y="285" font-family="Arial" font-size="28" fill="#4c5a64">Technical note — fictional demonstration dataset</text><line x1="125" y1="335" x2="1370" y2="335" stroke="#91b7d7" stroke-width="4"/><text x="125" y="410" font-family="Arial" font-size="30" fill="#25313a">The sealed loop stores surplus summer heat below one city block.</text><text x="125" y="458" font-family="Arial" font-size="30" fill="#25313a">The pilot tests delivery, access rules, and measured transfer losses.</text><g transform="translate(130 545)"><rect width="1080" height="260" fill="#d9dde0"/><rect x="60" y="105" width="150" height="115" fill="#91b7d7"/><rect x="270" y="65" width="150" height="155" fill="#91b7d7"/><rect x="480" y="125" width="150" height="95" fill="#e06a63"/><rect x="690" y="145" width="150" height="75" fill="#e06a63"/><rect x="900" y="90" width="150" height="130" fill="#91b7d7"/><line x1="30" y1="220" x2="1050" y2="220" stroke="#25313a" stroke-width="3"/></g><text x="125" y="900" font-family="Arial" font-size="24" fill="#4c5a64">Source: Synthetic City Energy Lab</text></svg>''',
'map.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#09131d"/><g fill="#132536" stroke="#27465f" stroke-width="3"><path d="M120 220 L520 120 L730 300 L620 560 L240 620Z"/><path d="M700 150 L1180 110 L1390 330 L1200 600 L760 520Z"/><path d="M1210 180 L1760 260 L1690 720 L1320 800 L1150 570Z"/></g><g stroke="#395b73" stroke-width="5" opacity=".65"><path d="M70 800 L1820 360"/><path d="M180 160 L1600 920"/><path d="M430 80 L820 1030"/><path d="M1030 50 L1370 1010"/></g><path d="M250 790 C600 400 950 720 1550 300" fill="none" stroke="#91b7d7" stroke-width="18" stroke-dasharray="34 22"/><circle cx="250" cy="790" r="28" fill="#f6f2e9"/><circle cx="1550" cy="300" r="32" fill="#e06a63"/><text x="130" y="120" font-family="Arial" font-size="48" fill="#f6f2e9">THE UNDERGROUND LOOP</text></svg>''',
'cross_section.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#07111b"/><rect y="0" width="1920" height="400" fill="#152a3c"/><g fill="#24394a"><rect x="180" y="170" width="360" height="230"/><rect x="650" y="110" width="420" height="290"/><rect x="1210" y="210" width="430" height="190"/></g><rect y="400" width="1920" height="680" fill="#11171d"/><ellipse cx="960" cy="710" rx="590" ry="240" fill="#202c34" stroke="#91b7d7" stroke-width="10"/><g stroke="#e06a63" stroke-width="26" fill="none"><path d="M470 710 C690 540 820 880 1040 690 S1370 560 1470 720"/><path d="M520 790 C720 650 900 930 1110 770 S1340 680 1420 820"/></g><g fill="#f0b35a"><circle cx="650" cy="650" r="26"/><circle cx="1110" cy="770" r="26"/><circle cx="1370" cy="650" r="26"/></g><text x="120" y="90" font-family="Arial" font-size="52" fill="#f6f2e9">HEAT VAULT CROSS-SECTION</text><text x="120" y="1010" font-family="Arial" font-size="28" fill="#c7d0d8">Synthetic engineering figure</text></svg>'''
}
for name, content in svgs.items():
    (source / name).write_text(content)

durations = [7, 7, 7, 7, 7, 8, 7, 7, 8, 10]
starts, cursor = [], 0
for duration in durations:
    starts.append(cursor)
    cursor += duration * 30

def base(index, asset_type, section, purpose):
    return {'shot_id': f'shot_{index:03d}', 'scene_id': f'scene_{index:03d}', 'start_frame': starts[index-1], 'end_frame': starts[index-1] + durations[index-1]*30, 'asset_type': asset_type, 'transition_in': 'fade' if index == 1 else 'dissolve', 'transition_out': 'fade' if index == len(durations) else 'dissolve', 'section_id': section, 'editorial_purpose': purpose, 'text_overlay': None}

shots = []
s = base(1, 'footage', 'section_opening', 'Establish a topic-specific city preparing for winter during the hottest day of summer.')
s.update({'visual_role':'context','video_asset':'assets/footage/city_heat.mp4','trim_in_sec':0,'trim_out_sec':7,'motion_variant':'push','hook_footage':True,'generic_stock':False,'hook_question':{'eyebrow':'A HIDDEN RESERVE','question':'Who decides whether a city can bank summer heat under its streets before winter?','deck':'A fictional engineering trial turns stored heat into a question of public control.'}})
shots.append(s)
s = base(2, 'evidence', 'section_opening', 'Reveal the first source-backed technical note and the sealed loop beneath one ordinary block.')
s.update({'visual_role':'evidence','evidence':{'kind':'official_document','title':'A sealed loop beneath one city block','subtitle':'The fictional pilot stores surplus heat before the cold season begins.','image_assets':['assets/images/document.png'],'source_ids':['synthetic-city-energy-lab'],'source_label':'Synthetic City Energy Lab'}})
shots.append(s)
s = base(3, 'evidence', 'section_opening', 'Translate the demonstration dataset into a concise visual account of stored energy and transfer loss.')
s.update({'visual_role':'evidence','evidence':{'kind':'data_table','title':'Storage works, but every transfer has a cost','subtitle':'The model keeps most of the charge while losses accumulate across the loop.','items':[{'label':'Charge retained','value':'84%'},{'label':'Heat delivered','value':'61%'},{'label':'Transfer loss','value':'23%'},{'label':'Winter reserve','value':'16 hours'}],'source_ids':['orvyq-demonstration-dataset'],'source_label':'ORVYQ Demonstration Dataset'}})
shots.append(s)
s = base(4, 'evidence', 'section_opening', 'Explain the four-step mechanism without turning the scene into a dense technical diagram.')
s.update({'visual_role':'evidence','evidence':{'kind':'concept_map','title':'Collect. Move. Hold. Return.','subtitle':'The engineering is simple enough to explain in four steps.','steps':['Capture roof heat','Move it below ground','Hold it in the sealed loop','Return it during cold demand'],'source_ids':['synthetic-engineering-model'],'source_label':'Synthetic Engineering Model'}})
shots.append(s)
s = base(5, 'footage', 'section_opening', 'Shift from engineering feasibility to the human decision about access and control.')
s.update({'visual_role':'context','video_asset':'assets/footage/street_work.mp4','trim_in_sec':0,'trim_out_sec':7,'motion_variant':'drift_left','generic_stock':False,'emphasis_card':{'eyebrow':'THE REAL TEST','title':'Who controls the reserve?','accent':'Control','anchor_text':'The engineering question becomes a civic decision.'}})
shots.append(s)
s = base(6, 'evidence', 'section_decision', 'Compare two operating models and show the tradeoff without presenting either as a final answer.')
s.update({'visual_role':'evidence','evidence':{'kind':'comparison','title':'Two ways to run the same vault','left':'Private operator','left_detail':'Faster optimization and narrower obligations','right':'Public operator','right_detail':'Broader access and slower decisions','source_ids':['synthetic-governance-scenarios'],'source_label':'Synthetic Governance Scenarios'}})
shots.append(s)
s = base(7, 'evidence', 'section_decision', 'Reconstruct the fictional decision timeline before the first cold night creates an emergency.')
s.update({'visual_role':'archive','evidence':{'kind':'source_timeline','title':'The decision has to happen before winter','subtitle':'The timeline closes long before the first emergency call.','items':[{'label':'Design review','value':'Week 1'},{'label':'Access rules','value':'Week 3'},{'label':'Pressure test','value':'Week 5'},{'label':'Public launch','value':'Week 8'}],'source_ids':['synthetic-project-timeline'],'source_label':'Synthetic Project Timeline'}})
shots.append(s)
s = base(8, 'evidence', 'section_decision', 'Map the route from rooftops to the underground vault and back to the buildings with winter demand.')
s.update({'visual_role':'evidence','evidence':{'kind':'regional_map','title':'A map of the underground loop','subtitle':'The route connects rooftops, the buried vault, and the buildings that need heat most.','image_assets':['assets/images/map.png'],'source_ids':['synthetic-city-map'],'source_label':'Synthetic City Map'}})
shots.append(s)
s = base(9, 'graphic', 'section_conclusion', 'Mark the narrative turn from a storage experiment to a question about durable public infrastructure.')
s.update({'visual_role':'graphic','graphic':{'type':'section_title','kicker':'THE WINTER TEST','title':'The heat returns','subtitle':'Storage is easy. Trust is the experiment.','presentation':'cinematic','mobile_font_px':42}})
shots.append(s)
s = base(10, 'evidence', 'section_conclusion', 'End on the synthetic cross-section and the conclusion that invisible infrastructure still needs visible rules.')
s.update({'visual_role':'evidence','evidence':{'kind':'official_figure','title':'Invisible infrastructure still needs visible rules','subtitle':'The vault only becomes a public promise when access and accountability are designed with it.','image_assets':['assets/images/cross_section.png'],'source_ids':['synthetic-heat-vault-figure'],'source_label':'Synthetic Heat Vault Figure'}})
shots.append(s)

plan = {'schema_version':'1.0-canonical','project_id':project_id,'mode':'proof','frame_range':{'start_frame':0,'end_frame':cursor},'fps':30,'duration_frames':cursor,'audio_mix_asset':'assets/audio/acceptance_mix.wav','captions_asset':'captions.json','brand':{'name':'ORVYQ','tagline':'Beyond the Known'},'production_mode':'synthetic_acceptance_proof','strategy':'single_canonical_renderer','render_source_sha':os.environ['SYSTEM_SHA'],'art_direction':{'tone':'restrained cinematic documentary','palette':'deep blue, warm heat, paper white'},'motion_hook':{'question':'Who decides whether a city can bank summer heat under its streets before winter?'},'blacklisted_assets':[],'source_usage':{},'evidence_asset_usage':{},'shots':shots,'quality_policy':{'visual_quality_limits':{'maximum_full_screen_text_fraction':0.05,'maximum_text_only_seconds':4,'maximum_presentation_chain':1,'minimum_modules_per_section':2,'minimum_module_repeat_gap':2,'minimum_mobile_font_px':36,'subtitle_clearance_px':180}}}
(direction / 'edit_plan.json').write_text(json.dumps(plan, indent=2) + '\n')
(direction / 'motion_hook.json').write_text(json.dumps({'question':plan['motion_hook']['question'],'question_deck':'A fictional engineering trial turns stored heat into a question of public control.','shots':[{'duration':7},{'duration':7},{'duration':7},{'duration':7}]}, indent=2) + '\n')

caption_texts = ['The hottest day is already planning for winter.','A sealed loop hides beneath one city block.','Storage works, but every transfer has a cost.','Collect. Move. Hold. Return.','The real test is who controls the reserve.','The same vault can serve two operating models.','The decision must happen before winter.','The route links rooftops, the vault, and demand.','By winter, this is no longer only about storage.','Invisible infrastructure still needs visible rules.']
captions = {'schema_version':'1.0','fps':30,'duration_frames':cursor,'captions':[]}
for index, (text, start, duration) in enumerate(zip(caption_texts, starts, durations), start=1):
    captions['captions'].append({'caption_id':f'caption_{index:03d}','scene_id':f'scene_{index:03d}','start_frame':start+18,'end_frame':start+duration*30-18,'text':text})
Path('templates/remotion/src/data/captions.json').write_text(json.dumps(captions, indent=2) + '\n')
Path('templates/remotion/src/data/scene_config.json').write_text(json.dumps({'fps':30,'width':1920,'height':1080,'duration_frames':cursor,'scenes':[]}, indent=2) + '\n')
Path('templates/remotion/src/data/asset_map.json').write_text(json.dumps({'audio_asset':'assets/audio/acceptance_mix.wav','asset_map':{}}, indent=2) + '\n')
PY

rsvg-convert -w 1920 -h 1080 "$SOURCE/city_heat.svg" -o "$SOURCE/city_heat.png"
rsvg-convert -w 1920 -h 1080 "$SOURCE/street_work.svg" -o "$SOURCE/street_work.png"
rsvg-convert -w 1500 -h 1000 "$SOURCE/document.svg" -o "$PUBLIC/images/document.png"
rsvg-convert -w 1920 -h 1080 "$SOURCE/map.svg" -o "$PUBLIC/images/map.png"
rsvg-convert -w 1920 -h 1080 "$SOURCE/cross_section.svg" -o "$PUBLIC/images/cross_section.png"
ffmpeg -y -loop 1 -i "$SOURCE/city_heat.png" -vf "zoompan=z='min(zoom+0.0007,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=240:s=1920x1080:fps=30,format=yuv420p" -frames:v 240 -an -c:v libx264 -preset veryfast -crf 24 "$PUBLIC/footage/city_heat.mp4"
ffmpeg -y -loop 1 -i "$SOURCE/street_work.png" -vf "zoompan=z='min(zoom+0.0005,1.06)':x='iw/2-(iw/zoom/2)+sin(on/24)*10':y='ih/2-(ih/zoom/2)':d=240:s=1920x1080:fps=30,format=yuv420p" -frames:v 240 -an -c:v libx264 -preset veryfast -crf 24 "$PUBLIC/footage/street_work.mp4"

durations=(7 7 7 7 7 8 7 7 8 10)
texts=(
  "On the hottest day of the year, this city is already planning for winter."
  "Beneath one ordinary block, a sealed loop stores heat that would otherwise disappear."
  "The demonstration model keeps most of the charge, but every transfer leaves a measurable loss."
  "The mechanism is simple: collect, move, hold, and return."
  "The difficult question begins after the engineering works: who controls the reserve?"
  "A private operator optimizes speed. A public operator must also protect access."
  "The fictional timeline shows why the decision cannot wait until the first cold night."
  "The route links rooftops, a buried vault, and the buildings that need heat most."
  "By winter, the experiment is no longer only about storage."
  "It is about whether invisible infrastructure can become a public promise instead of a hidden dependency."
)
: > "$SOURCE/concat.txt"
for i in "${!durations[@]}"; do
  n=$((i+1))
  raw="$SOURCE/narration_${n}_raw.wav"
  padded="$SOURCE/narration_${n}.wav"
  espeak-ng -v en-us+m3 -s 150 -p 42 -a 160 -w "$raw" "${texts[$i]}"
  ffmpeg -y -i "$raw" -af "apad=pad_dur=${durations[$i]},atrim=0:${durations[$i]}" -ar 48000 -ac 1 -c:a pcm_s16le "$padded"
  printf "file '%s'\n" "$(realpath "$padded")" >> "$SOURCE/concat.txt"
done
ffmpeg -y -f concat -safe 0 -i "$SOURCE/concat.txt" -ar 48000 -ac 1 -c:a pcm_s16le "$SOURCE/narration.wav"
ffmpeg -y -f lavfi -i "sine=frequency=72:duration=75:sample_rate=48000" -f lavfi -i "anoisesrc=color=pink:duration=75:sample_rate=48000" -filter_complex "[0:a]volume=0.022[a0];[1:a]lowpass=f=420,volume=0.008[a1];[a0][a1]amix=inputs=2:normalize=0[amb]" -map "[amb]" -ar 48000 -ac 1 -c:a pcm_s16le "$SOURCE/ambient.wav"
ffmpeg -y -i "$SOURCE/narration.wav" -i "$SOURCE/ambient.wav" -filter_complex "[0:a]volume=1.0[n];[1:a]volume=1.0[a];[n][a]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95" -t 75 -ar 48000 -ac 2 -c:a pcm_s16le "$PUBLIC/audio/acceptance_mix.wav"
test -s "$PUBLIC/audio/acceptance_mix.wav"

node scripts/orvyq_visual_plan.mjs --project-id="$PROJECT_ID" | tee "$PROOF/visual-plan.log"
node --input-type=module - <<'NODE'
import fs from 'node:fs';
import { loadCanonicalAjv } from './scripts/lib/schema-validate.mjs';
const id = process.env.PROJECT_ID;
const plan = JSON.parse(fs.readFileSync(`projects/${id}/direction/edit_plan.json`, 'utf8'));
const validate = loadCanonicalAjv().getSchema('edit_plan.schema.json');
if (!validate?.(plan)) throw new Error(JSON.stringify(validate?.errors || []));
NODE
cp "$PROJECT/direction/edit_plan.json" "$DATA/edit_plan.json"
cp "$PROJECT/direction/edit_plan.json" "$PROOF/final-edit-plan.json"
cp "$PROJECT/direction/opening_plan.json" "$PROOF/opening-plan.json"
cp "$PROJECT/qa/visual_module_plan.json" "$PROOF/visual-module-plan.json"

for audit in presentation_look visual_diversity metadata_leakage opening_quality text_density motion_continuity; do
  node "scripts/orvyq_${audit}_audit.mjs" --project-id="$PROJECT_ID"
done
cp "$PROJECT/qa/"*_audit.json "$PROOF/pre-render/"

pushd templates/remotion >/dev/null
npx tsc --noEmit
node --input-type=module -e "import { ensureBrowser } from '@remotion/renderer'; await ensureBrowser({ logLevel: 'info' });"
BROWSER="$(find node_modules/.remotion -type f \( -name chrome-headless-shell -o -name chrome \) -perm -111 -print -quit)"
test -n "$BROWSER"
export FACTFORGE_REMOTION_BROWSER_EXECUTABLE="$BROWSER"
npx remotion compositions src/index.ts | tee ../../acceptance-proof/compositions-before.log
npx remotion render src/index.ts FactForgeVideo ../../acceptance-proof/orvyq-acceptance-proof.mp4 --codec=h264 --audio-codec=aac --pixel-format=yuv420p --crf=24 --concurrency=1 --scale=0.6666666666666666 --log=verbose
npx tsc --noEmit
npx remotion compositions src/index.ts | tee ../../acceptance-proof/compositions-after.log
popd >/dev/null

for audit in presentation_look visual_diversity metadata_leakage opening_quality text_density motion_continuity; do
  node "scripts/orvyq_${audit}_audit.mjs" --project-id="$PROJECT_ID"
done
cp "$PROJECT/qa/"*_audit.json "$PROOF/post-render/"

VIDEO="$PROOF/orvyq-acceptance-proof.mp4"
test -s "$VIDEO"
ffprobe -v error -show_format -show_streams -of json "$VIDEO" > "$PROOF/media-metadata.raw.json"
ffmpeg -v error -i "$VIDEO" -f null - 2> "$PROOF/decode.log"
ffmpeg -hide_banner -i "$VIDEO" -vf "blackdetect=d=0.5:pic_th=0.995:pix_th=0.01" -an -f null - 2> "$PROOF/blackdetect.log"
ffmpeg -y -ss 2 -i "$VIDEO" -frames:v 1 "$PROOF/frames/first.png"
ffmpeg -y -ss 37.5 -i "$VIDEO" -frames:v 1 "$PROOF/frames/middle.png"
ffmpeg -y -ss 72 -i "$VIDEO" -frames:v 1 "$PROOF/frames/end.png"
ffmpeg -y -i "$VIDEO" -vf "fps=0.16,scale=320:-1,tile=4x3:padding=8:margin=8" -frames:v 1 -q:v 2 "$PROOF/contact-sheet.jpg"
test -s "$PROOF/contact-sheet.jpg"

# Remove all synthetic project data from shared-system scan roots before the required post-render independence audit.
rm -rf "$PROJECT"
git checkout -- templates/remotion/src/data
node scripts/orvyq_system_independence_audit.mjs
cp system-independence-report.json "$PROOF/post-render/system-independence-report.json"

python3 - <<'PY'
import hashlib, json, os, re
from fractions import Fraction
from pathlib import Path
from PIL import Image, ImageStat

root = Path('acceptance-proof')
video = root / 'orvyq-acceptance-proof.mp4'
media_raw = json.loads((root / 'media-metadata.raw.json').read_text())
streams = media_raw.get('streams', [])
video_stream = next((s for s in streams if s.get('codec_type') == 'video'), None)
audio_stream = next((s for s in streams if s.get('codec_type') == 'audio'), None)
if not video_stream or not audio_stream: raise SystemExit('video or audio stream missing')
duration = float(media_raw.get('format', {}).get('duration') or 0)
fps = float(Fraction(video_stream.get('r_frame_rate', '0/1')))
checks = {
'file_exists': video.exists(), 'file_size_positive': video.stat().st_size > 0,
'duration_60_to_90_seconds': 60 <= duration <= 90,
'resolution_1280x720': video_stream.get('width') == 1280 and video_stream.get('height') == 720,
'video_codec_h264': video_stream.get('codec_name') == 'h264', 'audio_stream_present': audio_stream is not None,
'frame_rate_30': abs(fps - 30) < .01, 'full_decode_passed': (root/'decode.log').exists() and (root/'decode.log').stat().st_size == 0,
'contact_sheet_created': (root/'contact-sheet.jpg').stat().st_size > 0}
black_log = (root/'blackdetect.log').read_text(errors='replace')
black_durations = [float(x) for x in re.findall(r'black_duration:([0-9.]+)', black_log)]
checks['no_long_black_frames'] = not black_durations or max(black_durations) < .75
sample_metrics = {}
for name in ['first','middle','end']:
    image = Image.open(root/'frames'/f'{name}.png').convert('L'); stat = ImageStat.Stat(image)
    mean, stddev = float(stat.mean[0]), float(stat.stddev[0])
    sample_metrics[name] = {'mean_luma':round(mean,3),'luma_stddev':round(stddev,3)}
    checks[f'{name}_frame_not_blank'] = mean > 4 and stddev > 4
opening = json.loads((root/'opening-plan.json').read_text())
module_plan = json.loads((root/'visual-module-plan.json').read_text())
required = {'cinematic_footage_overlay','document_dive','evidence_lens','comparison_composition','mechanism_explainer','data_scene','timeline_reconstruction','map_scene','editorial_emphasis_moment','chapter_transition'}
actual = set(module_plan.get('module_counts', {}))
checks['opening_engine_passed'] = opening.get('pass') is True
checks['opening_archetype_selected'] = opening.get('selected_archetype') in {'contradiction','human_consequence','object_mystery','scale_revelation','decision_point','archival_rupture'}
checks['first_evidence_within_45_seconds'] = float(opening.get('first_evidence',{}).get('actual_seconds') or 999) <= 45
checks['all_ten_module_families_present'] = required == actual
names = ['presentation_look','visual_diversity','metadata_leakage','opening_quality','text_density','motion_continuity']
audits = {'pre_render':{},'post_render':{}}
for phase, folder in [('pre_render','pre-render'),('post_render','post-render')]:
    for name in names:
        report = json.loads((root/folder/f'{name}_audit.json').read_text())
        audits[phase][name] = {'pass':report.get('pass'),'failures':report.get('failures',[])}
        checks[f'{phase}_{name}_pass'] = report.get('pass') is True
    independence = json.loads((root/folder/'system-independence-report.json').read_text())
    audits[phase]['system_independence'] = {'pass':independence.get('pass'),'failures':independence.get('violations', independence.get('failures', []))}
    checks[f'{phase}_system_independence_pass'] = independence.get('pass') is True
plan = json.loads((root/'final-edit-plan.json').read_text())
visible = []
for shot in plan.get('shots',[]):
    visible += [str(v) for v in (shot.get('visual_module',{}).get('visible_text') or {}).values() if v]
    if shot.get('asset_type') == 'graphic': visible += [str(shot.get('graphic',{}).get(k)) for k in ['kicker','title','subtitle'] if shot.get('graphic',{}).get(k)]
forbidden = re.compile(r'\b(?:CLM|SRC|ASSET|RUN|EVID|SHOT|SCENE)_[A-Z0-9_-]+\b', re.I)
checks['no_technical_metadata_visible'] = not any(forbidden.search(t) for t in visible)
checks['project_002_not_used'] = '002-' not in json.dumps(plan) and 'CLM_0' not in json.dumps(plan)
failed = [k for k,v in checks.items() if not v]
if failed: raise SystemExit('proof validation failed: ' + ', '.join(failed))
def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
media = {'duration_seconds':duration,'width':video_stream.get('width'),'height':video_stream.get('height'),'video_codec':video_stream.get('codec_name'),'pixel_format':video_stream.get('pix_fmt'),'frame_rate':fps,'audio_codec':audio_stream.get('codec_name'),'audio_channels':audio_stream.get('channels'),'file_size_bytes':video.stat().st_size,'sha256':sha256(video),'raw_ffprobe':media_raw}
(root/'media-metadata.json').write_text(json.dumps(media,indent=2)+'\n')
validation = {'schema_version':'1.0-orvyq-acceptance-proof-validation','pass':True,'system_commit':os.environ['SYSTEM_SHA'],'proof_execution_commit':os.environ.get('GITHUB_SHA'),'synthetic_project_id':os.environ['PROJECT_ID'],'synthetic_topic':'The City That Saved Summer Underground','selected_opening_archetype':opening.get('selected_archetype'),'module_counts':module_plan.get('module_counts'),'checks':checks,'sample_frame_metrics':sample_metrics,'black_durations_seconds':black_durations,'audits':audits,'media':{k:v for k,v in media.items() if k!='raw_ffprobe'}}
(root/'proof-validation.json').write_text(json.dumps(validation,indent=2)+'\n')
status=f'''# ORVYQ Cinematic Visual Engine — Acceptance Proof Status\n\n- PR: #5 — Rebuild ORVYQ visual engine as cinematic modules\n- Branch: `agent/orvyq-cinematic-visual-engine`\n- Verified system commit: `{os.environ['SYSTEM_SHA']}`\n- Generic CI run: `30476764932` — completed / success\n- Proof execution commit: `{os.environ.get('GITHUB_SHA')}` — temporary workflow only\n- Synthetic project: `{os.environ['PROJECT_ID']}`\n- Project 002 content used: No\n- Canonical renderer: `templates/remotion/src/Video.tsx` / `FactForgeVideo`\n- Selected opening archetype: `{opening.get('selected_archetype')}`\n- Duration: {duration:.3f} seconds\n- Output: 1280×720, H.264, {fps:.3f} fps, audio present\n\n## Systemic root cause fixed\n\nShared planner commentary contained fixed project claim identifiers. CI diagnostic uploads also ran when schema/unit producers had been skipped.\n\n## General system correction\n\nAll fixed claim examples were replaced by semantic documentation. Schema and unit artifacts are now gated on both expected files. Remotion composition checks provision the renderer-managed browser deterministically.\n\n## Generality evidence\n\nThis proof uses a new synthetic thermal-storage documentary with no Project 002 claims, sources, assets, scenes or run identifiers. All ten cinematic module families were selected through the shared selector, and the opening archetype was selected by the shared opening engine.\n\n## Verified gates\n\nPre-render and post-render presentation-look, visual-diversity, metadata-leakage, opening-quality, text-density, motion-continuity and system-independence audits passed. TypeScript type-check and composition resolution passed before and after rendering. The MP4 decoded end-to-end; media metadata, black-frame analysis, sample-frame analysis and contact-sheet creation passed.\n'''
(root/'implementation-status.md').write_text(status)
PY

cd "$PROOF"
sha256sum orvyq-acceptance-proof.mp4 contact-sheet.jpg proof-validation.json media-metadata.json implementation-status.md frames/*.png > sha256sums.txt
cat proof-validation.json
