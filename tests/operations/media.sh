#!/bin/sh
set -eu

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
node --input-type=module - "$scratch" <<'JS'
import sharp from "sharp";
await sharp({
  create: { width: 64, height: 64, channels: 3, background: "#387654" },
}).png().toFile(process.argv[2] + "/source.png");
JS
heif-enc -q 80 -o "$scratch/source.heic" "$scratch/source.png"
heif-convert "$scratch/source.heic" "$scratch/converted.png"
test "$(exiftool -s3 -FileType "$scratch/source.heic")" = HEIC
node --input-type=module - "$scratch" <<'JS'
import assert from "node:assert/strict";
import sharp from "sharp";
const { info } = await sharp(process.argv[2] + "/converted.png")
  .resize(32, 32).raw().toBuffer({ resolveWithObject: true });
assert.equal(info.width, 32);
assert.equal(info.height, 32);
console.log("Sharp", sharp.versions.sharp, "libvips", sharp.versions.vips);
JS

ffmpeg -v error -f lavfi -i color=c=blue:size=64x64:rate=2 -frames:v 2 \
  -c:v libx265 -x265-params pools=none:frame-threads=1:log-level=error \
  -tag:v hvc1 "$scratch/clip.mp4"
test "$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name \
  -of default=noprint_wrappers=1:nokey=1 "$scratch/clip.mp4")" = hevc
ffmpeg -v error -i "$scratch/clip.mp4" -frames:v 2 -f null -
ffprobe -version | sed -n '1p'
exiftool -ver
echo "Qualified synthetic HEIC image and HEVC MP4 in the release worker."
