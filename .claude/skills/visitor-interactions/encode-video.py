# encode-video.py: a stretch of a film cut and encoded small for a television's screen (World/Screens.js), in Blender's
# video sequencer — this Mac has no ffmpeg (sitting-and-tv.md, The video; the repo's CLAUDE.md, Shell and tools on this
# Mac).
#   <blender> --background --python <repo>/.claude/skills/visitor-interactions/encode-video.py -- <src> <out.mp4> <t0> <t1> \
#       <width> <height> <kbps> [fps]
# H.264 in MP4, no sound, a key frame every 60 frames, no B-frames, the bitrate `kbps` (at most 1.5 times it, a buffer
# of twice it), at `fps` (default 29.97: 30000/1001; give 25, 30, 24 … for a source at that rate — the sequencer plays
# a movie strip one source frame a scene frame). t0 and t1 are seconds into the source. Blender writes the moov atom
# at the end of the file, which the page's <video> plays once loaded (sitting-and-tv.md, The video).
# Ladonia's (2026-10-16): the Commons webm of the Earth from the ISS (19.5 MB), 28 to 68 s, 960 × 540 at 600 kbps →
# 2.67 MB, cut to miss NASA's text at its start and its insignia at its end (assets/THIRD_PARTY.md, Televisions).
# Blender on this Mac: /Applications/Blender.app/Contents/MacOS/Blender (5.1).
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) < 7:
    sys.exit("usage: blender --background --python encode-video.py -- <src> <out.mp4> <t0> <t1> <width> <height> <kbps> [fps]")
src, out = argv[0], argv[1]
t0, t1 = float(argv[2]), float(argv[3])
w, h, kbps = int(argv[4]), int(argv[5]), int(argv[6])
rate = float(argv[7]) if len(argv) > 7 else 30000 / 1001
sc = bpy.context.scene
if abs(rate - 30000 / 1001) < 0.01:
    sc.render.fps, sc.render.fps_base = 30000, 1001
elif abs(rate - 24000 / 1001) < 0.01:
    sc.render.fps, sc.render.fps_base = 24000, 1001
else:
    sc.render.fps, sc.render.fps_base = round(rate), 1
fps = sc.render.fps / sc.render.fps_base
sc.sequence_editor_create()
se = sc.sequence_editor
strips = se.strips if hasattr(se, "strips") else se.sequences
strips.new_movie("m", src, 1, 1)
sc.frame_start, sc.frame_end = 1 + round(t0 * fps), round(t1 * fps)
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
r = sc.render
if hasattr(r.image_settings, "media_type"):
    r.image_settings.media_type = "VIDEO"
r.image_settings.file_format = "FFMPEG"
r.ffmpeg.format = "MPEG4"
r.ffmpeg.codec = "H264"
r.ffmpeg.constant_rate_factor = "NONE"
r.ffmpeg.video_bitrate = kbps
r.ffmpeg.maxrate = int(kbps * 1.5)
r.ffmpeg.minrate = 0
r.ffmpeg.buffersize = kbps * 2
r.ffmpeg.gopsize = 60
r.ffmpeg.use_max_b_frames = False
r.ffmpeg.audio_codec = "NONE"
r.use_file_extension = False
r.filepath = out
bpy.ops.render.render(animation=True)
print("ENCODED", out, "frames", sc.frame_start, "to", sc.frame_end, "at", round(fps, 3), "fps")
