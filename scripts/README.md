This directory contains scripts and input files used outside of dte to create
shape files.

## Scripts

- makepatchmodels: Shell script used to convert .obj patch models created
by dte into .s files.

- tobj2s.py: Blender python script used by makepatchmodels.

- makebrdgtrack: Shell script used to create track shape files for bridges
and curved switches.

- trackshape.py: Blender python script used to create track shape file given
a track path file and a track profile file.

## Track Profile Files

- ustracks.json: US Tracks track profile file used to create normal track and
custom switches.

- ballastdeck.json: US Tracks track profile with narrow ballast and bridge
guard rails.

- bridgerails.json: US Tracks track profile with bridge rails only.

## Switch Track Shapes

- switch06l.json: 6 degree left switch with switch stand on curved side.

- switch06d.json: 6 degree left switch with curved main route.

- switch06ls.json: 6 degree left switch with switch stand on straight side.

- switch06lx.json: points only 6 degree left switch.

- switch06r.json: 6 degree right switch with switch stand on curved side.

- switch06rd.json: 6 degree right switch with curved main route.

- switch06rs.json: 6 degree right switch with switch stand on straight side.

- switch06rx.json: points only 6 degree right switch.

- derail.json: a split point derail used on the stjlc route.

- switchstand.blend: blender switch stand model used by other files.
