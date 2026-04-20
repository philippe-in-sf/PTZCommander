#!/bin/sh
set -eu

exec "${FFMPEG_PATH:-ffmpeg}" \
  -hide_banner \
  -loglevel warning \
  -rtsp_transport tcp \
  -i "${RTSP_URL:?RTSP_URL is required}" \
  -an \
  -sn \
  -dn \
  -r 12 \
  -q:v 6 \
  -f mpjpeg \
  -boundary_tag frame \
  pipe:1
