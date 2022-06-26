This directory contains scripts and input files used outside of dte to create
shape files.
The scripts are known to work with blender 2.82.
Wayne Campbell's shape export plugin is required.

## Scripts

- makepatchmodels: Shell script used to convert .obj patch models created
by dte into .s files.

- tobj2s.py: Blender python script used by makepatchmodels.

- makebrdgtrack: Shell script used to create track shape files for bridges
and curved switches.

- trackshape.py: Blender python script used to create track shape file given
a track path file and a track profile file.
 usage: blender -b --python trackshape.py -- *shape.json* *profile.json*

## Track Profile Files

These files contain information similar to the Open Rails dynamic track
profile in the TrProfile.stf file.
The order of verticies is important, normals will be flipped is they are listed
backwards.

- ustracks.json: US Tracks track profile file used to create normal track and
custom switches.

- ballastdeck.json: US Tracks track profile with narrow ballast and bridge
guard rails.

- bridgerails.json: US Tracks track profile with bridge rails only.

## Switch Track Shapes

These files contain information similar to track shapes in the global
tsection.dat file.
Paths must be listed in left to right order.

- switch06l.json: 6 degree left switch with switch stand on curved side
(track shape 38052).

- switch06ld.json: 6 degree left switch with curved main route
(track shape 22697).

- switch06ls.json: 6 degree left switch with switch stand on straight side
(track shape 38052).

- switch06lx.json: points only 6 degree left switch (track shape 39829).

- switch06r.json: 6 degree right switch with switch stand on curved side
(track shape 38053).

- switch06rd.json: 6 degree right switch with curved main route
(track shape 22698).

- switch06rs.json: 6 degree right switch with switch stand on straight side
(track shape 38053).

- switch06rx.json: points only 6 degree right switch (track shape 39830).

- derail.json: a split point derail used on the stjlc route
(track shape 24799).

- switchstand.blend: blender switch stand model used by other files.
