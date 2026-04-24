#!/bin/sh
set -eu

INPUT_URL="${PREVIEW_URL:-${RTSP_URL:-}}"
if [ -z "$INPUT_URL" ]; then
  echo "PREVIEW_URL is required" >&2
  exit 2
fi

if [ "${PREVIEW_PROTOCOL:-rtsp}" = "rtsp" ]; then
  exec "${FFMPEG_PATH:-ffmpeg}" \
    -hide_banner \
    -loglevel warning \
    -rtsp_transport tcp \
    -i "$INPUT_URL" \
    -an \
    -sn \
    -dn \
    -r 12 \
    -q:v 6 \
    -f mpjpeg \
    -boundary_tag frame \
    pipe:1
fi

exec "${FFMPEG_PATH:-ffmpeg}" \
  -hide_banner \
  -loglevel warning \
  -i "$INPUT_URL" \
  -an \
  -sn \
  -dn \
  -r 12 \
  -q:v 6 \
  -f mpjpeg \
  -boundary_tag frame \
  pipe:1
