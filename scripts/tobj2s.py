#	creates a .s file from terrain patch .obj file

import bpy
import math
import os
import sys

args= sys.argv[sys.argv.index("--")+1:]
objfile= args[0]
fname= objfile[6:-4]
sfile= 'SHAPES/t'+fname+'.s'
pngfile= 'TEXTURES/t'+fname+'.png'
acefile= 'TEXTURES/t'+fname+'.ace'

if "Cube" in bpy.data.objects:
    obj= bpy.data.objects["Cube"]
    bpy.data.objects.remove(obj)

bpy.ops.import_scene.obj(filepath=objfile,axis_forward="Y",axis_up="Z")
maincol= bpy.data.collections.new("MAIN")
main2000col= bpy.data.collections.new("MAIN_2000")
maincol.children.link(main2000col)
bpy.context.scene.collection.children.link(maincol)

root= None

def addObject(name,texture,trans):
    global root
    if name in bpy.data.objects:
        obj= bpy.data.objects[name]
        obj.data.use_auto_smooth= 1
        obj.data.auto_smooth_angle= math.radians(80)
        mat= bpy.data.materials.new(name)
        mat.msts.BaseColorFilepath= texture
        mat.msts.MipMapLODBias= -1
        mat.msts.Lighting= "NORMAL"
        mat.msts.Transparency= trans
        obj.active_material= mat
        if root:
            obj.parent= root
        else:
            root= obj
        main2000col.objects.link(obj)

#addObject("main",pngfile,"OPAQUE")
addObject("main","fieldwmt.ace","OPAQUE")
addObject("walls","StoneGreyCourseRough.ace","OPAQUE")
addObject("tracks","roadbed.ace","OPAQUE")
addObject("roads","road2lane.ace","OPAQUE")
addObject("dirtroads","dirtroad.ace","OPAQUE")
addObject("trees","treesmt.ace","OPAQUE")
addObject("field","fieldmt.ace","OPAQUE")
addObject("field20","field20mt.ace","OPAQUE")
addObject("field40","field40mt.ace","OPAQUE")
addObject("fieldw","fieldwmt.ace","OPAQUE")

bpy.ops.export.msts_s(filepath=sfile)
