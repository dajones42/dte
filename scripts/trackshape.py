# Copyright © 2022 Doug Jones
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

# creates a track .s file from profile and path information
# usage: blender -b --python trackshape.py -- *shape.json* *profile.json*

import bpy
import math
import mathutils
import os
import sys
import json
import functools

def readjson(filename):
    fd= open(filename,'r')
    return json.load(fd)

if "Cube" in bpy.data.objects:
    obj= bpy.data.objects["Cube"]
    bpy.data.objects.remove(obj)

# returns twice the area of a triangle
# positive if the points are listed in clockwise order, else negative
def triArea(x1,y1,x2,y2,x3,y3):
    return (x2-x1)*(y3-y1) - (x3-x1)*(y2-y1)

# finds the intersection between two line segments a-b and c-d.
# returns None if intersection is not on either segment
def segSegInt(a,b,c,d):
#    print("a %f %f"%(a.x,a.y))
#    print("b %f %f"%(b.x,b.y))
#    print("c %f %f"%(c.x,c.y))
#    print("d %f %f"%(d.x,d.y))
    denom= a.x*(d.y-c.y) + b.x*(c.y-d.y) + c.x*(a.y-b.y) + d.x*(b.y-a.y)
    if denom==0:
    	return None # parallel or collinear
    s= (a.x*(d.y-c.y) + c.x*(a.y-d.y) + d.x*(c.y-a.y)) / denom
    if s<0 or s>1:
        return None # not on segment a-b
    t= -(a.x*(c.y-b.y) + b.x*(a.y-c.y) + c.x*(b.y-a.y)) / denom
    if t<0 or t>1:
        return None # not on segment c-d
    x= a.x + s*(b.x-a.x)
    y= a.y + s*(b.y-a.y)
#    print("pi %f %f %f %f"%(x,y,s,t))
#    return { "s": s, "t": t, "x": x, "y": y }
    return mathutils.Vector([x,y,0])

# returns a direction vector given a heading angle
def headingVector(angle):
    a= math.radians(angle)
    dx= math.cos(a)
    dy= math.sin(a)
    return mathutils.Vector([dy,dx,0])

# creates an array of center line points and perpendicular vectors
# for the specified path
def getCenterLine(path):
    cl= []
    start= path["start"]
    p= mathutils.Vector([start[0],start[2],start[1]])
    heading= path["angle"]
#    print("start %f %f %f  %f"%(p.x,p.y,p.z,heading))
    cl.append({ "point":p, "perp":headingVector(heading+90) })
    for move in path["moves"]:
        dir= headingVector(heading)
        if move[1]==0:
            p= p+dir*move[0]
            cl.append({ "point":p, "perp":headingVector(heading+90) })
        else:
            perp= headingVector(heading+90)
            r= move[0]
            d= math.radians(move[1])
            m= int(math.ceil(abs(move[1])))
            if len(move)>2: m= move[2]
            angle= d/m
            t= abs(r*math.tan(angle/2))
            if t < .01: m=0
            h= 0
            cs= 1
            sn= 0
            for i in range(m):
                p= p+dir*(t*cs)
                p= p+perp*(t*sn)
                h+= angle
                cs= math.cos(h)
                sn= math.sin(h)
                p= p+dir*(t*cs)
                p= p+perp*(t*sn)
                cl.append({ "point":p,
                 "perp":headingVector(heading+90+math.degrees(h)) })
#                print("cpoint %f %f %f"%(p.x,p.y,p.z))
            heading= heading+math.degrees(h)
#        print("point %f %f %f  %f"%(p.x,p.y,p.z,heading))
    path["centerLine"]= cl
    return cl

# prints the given center line for debugging
def printCenterLine(centerLine):
    for i in range(len(centerLine)):
        p= centerLine[i]["point"]
        perp= centerLine[i]["perp"]
        print(" %d %f %f %f %f"%(i,p.x,p.y,perp.x,perp.y))

# path comparison function used to sort paths into left to right order
def pathCenterLineCmp(path1,path2):
    cl1= path1["centerLine"]
    cl2= path2["centerLine"]
    p1= cl1[len(cl1)-1]["point"]
    p2= cl2[len(cl2)-1]["point"]
    a= triArea(0,0,p1.x,p1.y,p2.x,p2.y)
    if a < 0: return -1
    if a > 0: return 1
    return 0

# returns a copy of the given centerline from dist1 to dist4
# adds points at dist2 and dist3 if necessary
def copyCenterLine(centerLine,dist1,dist2,dist3,dist4):
#    if dist1 and dist4:
#        print(" %f %f %f %f"%(dist1,dist2,dist3,dist4))
#    elif dist1:
#        print(" %f %f %f -"%(dist1,dist2,dist3))
#    elif dist4:
#        print(" - %f %f %f"%(dist2,dist3,dist4))
#    else:
#        print(" - %f %f -"%(dist2,dist3))
    cl= []
    dist= 0
    for i in range(len(centerLine)-1):
        p1= centerLine[i]["point"]
        p2= centerLine[i+1]["point"]
        perp1= centerLine[i]["perp"]
        perp2= centerLine[i+1]["perp"]
        d= (p2-p1).length
        if i==0 and dist2 and dist3 and dist2<dist and dist<dist3:
            cl.append({ "point":p1, "perp":perp1 })
        if dist1 and dist<=dist1 and dist+d>dist1:
            x= (dist1-dist)/d
            p= p1.lerp(p2,x)
            perp= perp1.lerp(perp2,x)
            cl.append({ "point":p, "perp":perp })
        if dist2 and dist<=dist2 and dist+d>dist2:
            x= (dist2-dist)/d
            p= p1.lerp(p2,x)
            perp= perp1.lerp(perp2,x)
            cl.append({ "point":p, "perp":perp })
        if dist3 and dist<=dist3 and dist+d>dist3:
            x= (dist3-dist)/d
            p= p1.lerp(p2,x)
            perp= perp1.lerp(perp2,x)
            cl.append({ "point":p, "perp":perp })
        if dist4 and dist<=dist4 and dist+d>dist4:
            x= (dist4-dist)/d
            p= p1.lerp(p2,x)
            perp= perp1.lerp(perp2,x)
            cl.append({ "point":p, "perp":perp })
        if dist2 and dist3 and dist2<dist+d and dist+d<dist3:
            cl.append({ "point":p2, "perp":perp2 })
        dist= dist+d
    return cl

# copies perpendicular information from cl2 to cl1
def copyPerp(cl1,cl2):
    for i in range(len(cl1)):
        p= cl1[i]["point"]
        perp= cl1[i]["perp"]
        for j in range(5):
            p11= p+perp*100
            p12= p-perp*100
            for k in range(len(cl2)-1):
                p21= cl2[k]["point"]
                p22= cl2[k+1]["point"]
                pi= segSegInt(p11,p12,p21,p22)
                if pi:
                    perp1= cl2[k]["perp"]
                    perp2= cl2[k+1]["perp"]
                    d1= (pi-p21).length;
                    d2= (pi-p22).length;
                    perp= perp1.lerp(perp2,d2/(d2+d1))
                    break
        cl1[i]["perp"]= perp

# finds the crossing point between two center lines each
# offset by the specified amount (negative offset is to the left)
# returns the intersection point and the distance down each line
# returns None if it is no crossing point
def findCrossing(cl1,cl2,offset1,offset2):
    dist10= cl1[0]["point"].length
    dist20= cl2[0]["point"].length
    dist1= 0
    dist2= 0
    i1= 0
    i2= 0
    while i1<len(cl1)-1 and i2<len(cl2)-1:
        p11= cl1[i1]["point"] + cl1[i1]["perp"]*offset1
        p12= cl1[i1+1]["point"] + cl1[i1+1]["perp"]*offset1
        p21= cl2[i2]["point"] + cl2[i2]["perp"]*offset2
        p22= cl2[i2+1]["point"] + cl2[i2+1]["perp"]*offset2
        pi= segSegInt(p11,p12,p21,p22)
        if pi:
            d1= (pi-p11).length
            d2= (pi-p21).length
#            print("crossing %f %f  %f %f %d %d %f %f"%
#            (offset1,offset2,pi.x,pi.y,i1,i2,dist1+d1,dist2+d2))
            return { "pi": pi, "dist1": dist1+d1, "dist2": dist2+d2 }
        d1= (cl1[i1+1]["point"]-cl1[i1]["point"]).length
        d2= (cl2[i2+1]["point"]-cl2[i2]["point"]).length
#        print(" %d %d %f %f"%(i1,i2,d1,d2))
        if dist10+dist1+d1 < dist20+dist2+d2:
            i1= i1+1
            dist1= dist1+d1
        else:
            i2= i2+1
            dist2= dist2+d2
#    print("no crossing %f %f"%(offset1,offset2))
    return None

# makes a mesh and object for a single part of the track model
# ends is a bit flag that controls taper at end of rail
#  bit 1 is near end taper to inside
#  bit 2 is far end taper to inside
#  bit 4 is near end taper to outside
#  bit 8 is far end taper to outside
def makeMesh(lod,shape,part,centerLine,ends,anim):
    pivot= mathutils.Vector([0,0,0])
    if anim:
        pivot= anim["pivot"]
    coords= []
    uvs= []
    faces= []
    vi= 0
    polylines= lod["Polylines"]
    for polyline in polylines:
        if part and polyline["part"]!=part:
            continue
        dtc= polyline["DeltaTexCoord"]
        point0= centerLine[0]["point"]
        dist= 0
        for i in range(len(centerLine)):
            point= centerLine[i]["point"]
            perp= centerLine[i]["perp"]
            dist= dist+(point-point0).length
            if i==0 and "verticesi" in polyline and (ends&1)!=0:
                verts= polyline["verticesi"]
            elif i==0 and "verticeso" in polyline and (ends&4)!=0:
                verts= polyline["verticeso"]
            elif i==len(centerLine)-1 and "verticesi" in polyline and (ends&2)!=0:
                verts= polyline["verticesi"]
            elif i==len(centerLine)-1 and "verticeso" in polyline and (ends&8)!=0:
                verts= polyline["verticeso"]
            else:
                verts= polyline["Vertices"]
            nverts= len(verts)
            for j in range(len(verts)):
                pos= verts[j]["Position"]
                texc= verts[j]["TexCoord"]
                p= point+perp*pos[0]+mathutils.Vector([0,0,pos[1]])-pivot
                coords.append(p)
                uv= [texc[0]+dist*dtc[0],1-(texc[1]+dist*dtc[1])]
                uvs.append(uv)
                if i>0 and j>0:
                    vij= vi+j-1
                    face= (vij-nverts,vij-nverts+1,vij+1,vij)
                    faces.append(face)
            point0= point
            vi= vi+nverts
    if not coords:
        return
    name= lod["Name"]
    texture= lod["TexName"]
    mesh= bpy.data.meshes.new(name)
    mesh.from_pydata(coords,[],faces)
    mesh.calc_normals()
#    mesh.calc_normals_split()
#    mesh.create_normals_split()
    obj= bpy.data.objects.new(name,mesh)
    lod["objects"].append(obj)
    if anim:
        obj.location= pivot.x, pivot.y, pivot.z
        obj.rotation_euler= 0, 0, anim["angle0"]
        obj.keyframe_insert("rotation_euler",frame=0)
        obj.rotation_euler= 0, 0, anim["angle1"]
        obj.keyframe_insert("rotation_euler",frame=1)
        obj.rotation_euler= 0, 0, anim["angle0"]
    mesh.uv_layers.new(name="UVMap")
    uvlayer= mesh.uv_layers.active.data
    for poly in mesh.polygons:
        for li in range(poly.loop_start,poly.loop_start+poly.loop_total):
            uvlayer[li].uv= uvs[mesh.loops[li].vertex_index]
    mat= bpy.data.materials.new(texture)
    mat.msts.BaseColorFilepath= texture
    mat.msts.MipMapLODBias= lod["MipMapLevelOfDetailBias"]
    if lod["LightModelName"] == "OptSpecular25":
        mat.msts.Lighting= "SPECULAR25"
    elif lod["LightModelName"] == "OptSpecular750":
        mat.msts.Lighting= "SPECULAR750"
    else:
        mat.msts.Lighting= "NORMAL"
    if lod["ShaderName"].startswith("BlendA"):
        mat.msts.Transparency= "ALPHA"
    else:
        mat.msts.Transparency= "OPAQUE"
    obj.active_material= mat

# makes a list of partial center lines for the parts needed to make
# a switch model
def makeSwitchPartLines(shape):
    partLines= []
    cl1= shape["paths"][0]["centerLine"]
    cl2= shape["paths"][1]["centerLine"]
    g= profile["gauge"]
    rh= profile["railhead"]
    f= profile["flangeway"]
    derail= ""
    if "derail" in shape:
        derail= shape["derail"]
    points0= findCrossing(cl1,cl2,0,0)
    points= findCrossing(cl1,cl2,(f+rh)/2,-(f+rh)/2)
    frogPoint= findCrossing(cl1,cl2,g/2,-g/2)
    frogPointRH= findCrossing(cl1,cl2,g/2+rh,-g/2-rh)
    frogStartL= findCrossing(cl1,cl2,g/2,-g/2+f)
    frogStartLRH= findCrossing(cl1,cl2,g/2+rh,-g/2+f)
    frogStartR= findCrossing(cl1,cl2,g/2-f,-g/2)
    frogStartRRH= findCrossing(cl1,cl2,g/2-f,-g/2-rh)
    frogStart= findCrossing(cl1,cl2,g/2-f/2,-g/2+f/2)
    frogStartRH= findCrossing(cl1,cl2,g/2-f/2+rh/2,-g/2+f/2-rh/2)
    animL= None
    animR= None
    if points0 and points:
        d= points["dist1"]-points0["dist1"]
        a= math.asin((f+rh)/d)
        pivot1= points["pi"]+mathutils.Vector([-g/2,0,0])
        pivot2= points["pi"]+mathutils.Vector([g/2,0,0])
        if shape["mainroute"]:
            animL= {"pivot":pivot1,"angle0":0,"angle1":a}
            animR= {"pivot":pivot2,"angle0":-a,"angle1":0}
        else:
            animL= {"pivot":pivot1,"angle0":a,"angle1":0}
            animR= {"pivot":pivot2,"angle0":0,"angle1":-a}
        bpy.context.scene.frame_end= 2
    if frogStart:
        x= frogStart["dist1"]
        line= copyCenterLine(cl1,x-.1,x,x+1.8,x+2)
        partLines.append({"part":"rightguardrail","centerLine":line,"ends":3})
        x= frogStart["dist2"]
        line= copyCenterLine(cl2,x-.1,x,x+1.8,x+2)
        partLines.append({"part":"leftguardrail","centerLine":line,"ends":3})
    if frogPoint:
        x= frogPoint["dist1"]
        line= copyCenterLine(cl1,x-1,x-.8,x+1.8,x+2)
        partLines.append({"part":"leftguardrail","centerLine":line,"ends":3})
        x= frogPoint["dist2"]
        line= copyCenterLine(cl2,x-1,x-.8,x+1.8,x+2)
        partLines.append({"part":"rightguardrail","centerLine":line,"ends":3})
    partLines.append({"part":"leftrail","centerLine":cl1,"ends":0})
    if derail != "left":
        if points0 and points:
            y= points0["dist1"]
            x= points["dist1"]
            if y==0: y=.001
            line= copyCenterLine(cl1,y,(x+y)/2,x,None)
            partLines.append({"part":"rightrail","centerLine":line,"ends":1,"anim":animR})
            if frogStartL:
                y= frogStartL["dist1"]
                z= frogStartLRH["dist1"]
                line= copyCenterLine(cl1,None,x,y,z)
                partLines.append({"part":"rightrail","centerLine":line,"ends":8})
            else:
                line= copyCenterLine(cl1,None,x,1000,None)
                partLines.append({"part":"rightrail","centerLine":line,"ends":0})
        elif frogStartL:
            x= -1
            y= frogStartL["dist1"]
            z= frogStartLRH["dist1"]
            line= copyCenterLine(cl1,None,x,y,z)
            partLines.append({"part":"rightrail","centerLine":line,"ends":8})
        else:
            partLines.append({"part":"rightrail","centerLine":cl1,"ends":0})
    if frogPoint:
        x= frogPoint["dist1"]
        y= frogPointRH["dist1"]
        line= copyCenterLine(cl1,x,y,1000,None)
        partLines.append({"part":"rightrail","centerLine":line,"ends":1})
    partLines.append({"part":"rightrail","centerLine":cl2,"ends":0})
    if derail != "right":
        if points0 and points:
            y= points0["dist2"]
            x= points["dist2"]
            if y==0: y=.001
            line= copyCenterLine(cl2,y,(x+y)/2,x,None)
            partLines.append({"part":"leftrail","centerLine":line,"ends":1,"anim":animL})
            if frogStartR:
                y= frogStartR["dist2"]
                z= frogStartRRH["dist2"]
                line= copyCenterLine(cl2,None,x,y,z)
                partLines.append({"part":"leftrail","centerLine":line,"ends":8})
            else:
                line= copyCenterLine(cl2,None,x,1000,None)
                partLines.append({"part":"leftrail","centerLine":line,"ends":0})
        elif frogStartR:
            x= -1
            y= frogStartR["dist2"]
            z= frogStartRRH["dist2"]
            line= copyCenterLine(cl2,None,x,y,z)
            partLines.append({"part":"leftrail","centerLine":line,"ends":8})
        else:
            partLines.append({"part":"leftrail","centerLine":cl2,"ends":0})
    if frogPoint:
        x= frogPoint["dist2"]
        y= frogPointRH["dist2"]
        line= copyCenterLine(cl2,x,y,1000,None)
        partLines.append({"part":"leftrail","centerLine":line,"ends":1})
    copyPerp(cl2,cl1)
    if derail != "left":
        partLines.append({"part":"ballast","centerLine":cl1,"ends":0})
        partLines.append({"part":"ties","centerLine":cl1,"ends":0})
    if derail != "right":
        partLines.append({"part":"ballast","centerLine":cl2,"ends":0})
        partLines.append({"part":"ties","centerLine":cl2,"ends":0})
    return partLines

# returns True if paths has two paths that cross
def hasCrossing(paths):
    if (len(paths) < 2): return False
    cl1= paths[0]["centerLine"]
    cl2= paths[1]["centerLine"]
    p10= cl1[0]["point"]
    p11= cl1[len(cl1)-1]["point"]
    p20= cl2[0]["point"]
    p21= cl2[len(cl2)-1]["point"]
    a1= triArea(p10.x,p10.y,p11.x,p11.y,p20.x,p20.y)
    a2= triArea(p10.x,p10.y,p11.x,p11.y,p21.x,p21.y)
    print("hascrossing %f %f"%(a1,a2))
    if a1>.1 and a2<-.1: return True
    if a1<-.1 and a2>.1: return True
    return False

# adds parts to partLines for a single crossing rail
# rail follows cl1 offset to side defined by sign
def addCrossingRail(partLines,part,cl1,cl2,sign,ends1,ends2,ends3):
#    print("addcrossingrail %s %.0f"%(part,sign))
    g= profile["gauge"]/2
    rh= profile["railhead"]
    f= profile["flangeway"]
    x1= findCrossing(cl1,cl2,sign*(g+rh),g+rh)["dist1"]
    x2= findCrossing(cl1,cl2,sign*g,g)["dist1"]
    x3= findCrossing(cl1,cl2,sign*(g+rh),g-f)["dist1"]
    x4= findCrossing(cl1,cl2,sign*g,g-f)["dist1"]
    x5= findCrossing(cl1,cl2,sign*(g+rh),-g+f)["dist1"]
    x6= findCrossing(cl1,cl2,sign*g,-g+f)["dist1"]
    x7= findCrossing(cl1,cl2,sign*g,-g)["dist1"]
    x8= findCrossing(cl1,cl2,sign*(g+rh),-g-rh)["dist1"]
    x1,x2,x3,x4,x5,x6,x7,x8= sorted([x1,x2,x3,x4,x5,x6,x7,x8])
    line= copyCenterLine(cl1,None,-1,x1,x2)
    partLines.append({"part":part,"centerLine":line,"ends":ends1})
    line= copyCenterLine(cl1,x3,x4,x5,x6)
    partLines.append({"part":part,"centerLine":line,"ends":ends2})
    line= copyCenterLine(cl1,x7,x8,1000,None)
    partLines.append({"part":part,"centerLine":line,"ends":ends3})

# adds parts to partLines for a single crossing guard rail
# rail follows cl1 offset to side defined by sign
def addCrossingGuardRail(partLines,part,cl1,cl2,sign,shape,ends1,ends2,ends3):
#    print("addcrossingguardrail %s %.0f"%(part,sign))
    g= profile["gauge"]/2
    rh= profile["railhead"]
    f= profile["flangeway"]
    x1= findCrossing(cl1,cl2,sign*(g-f-rh),g+rh)["dist1"]
    x2= findCrossing(cl1,cl2,sign*(g-f),g+rh)["dist1"]
    x3= findCrossing(cl1,cl2,sign*(g-f-rh),g-f)["dist1"]
    x4= findCrossing(cl1,cl2,sign*(g-f),g-f)["dist1"]
    x5= findCrossing(cl1,cl2,sign*(g-f-rh),-g+f)["dist1"]
    x6= findCrossing(cl1,cl2,sign*(g-f),-g+f)["dist1"]
    x7= findCrossing(cl1,cl2,sign*(g-f),-g-rh)["dist1"]
    x8= findCrossing(cl1,cl2,sign*(g-f-rh),-g-rh)["dist1"]
    skew= x3 - findCrossing(cl1,cl2,-sign*(g-f),g-f)["dist1"]
    x1,x2,x3,x4,x5,x6,x7,x8= sorted([x1,x2,x3,x4,x5,x6,x7,x8])
    len1= 1
    len2= 2
    len3= 2
    if "guardRailLengths" in shape:
        len1,len2,len3= shape["guardRailLengths"]
    if skew < 0:
        line= copyCenterLine(cl1,x1-len1,x1-(len1-.2),x1,x2)
        partLines.append({"part":part,"centerLine":line,"ends":ends1})
        if x6-x3 > len2:
            line= copyCenterLine(cl1,x6-len2,x6-len2+.2,x5,x6)
            partLines.append({"part":part,"centerLine":line,"ends":3})
        else:
            line= copyCenterLine(cl1,x3,x4,x5,x6)
            partLines.append({"part":part,"centerLine":line,"ends":ends2})
        len1-= skew
        if len1 > len3:
            line= copyCenterLine(cl1,x7+len1-len3,x7+len1-len3+.2,
            x7+len1-.2,x7+len1)
            partLines.append({"part":part,"centerLine":line,"ends":3})
        else:
            line= copyCenterLine(cl1,x7,x8,x7+len1-.2,x7+len1)
            partLines.append({"part":part,"centerLine":line,"ends":ends3})
    else:
        line= copyCenterLine(cl1,x7,x8,x7+len1-.2,x7+len1)
        partLines.append({"part":part,"centerLine":line,"ends":ends3})
        if x6-x3 > len2:
            line= copyCenterLine(cl1,x3,x4,x3+len2-.2,x3+len2)
            partLines.append({"part":part,"centerLine":line,"ends":3})
        else:
            line= copyCenterLine(cl1,x3,x4,x5,x6)
            partLines.append({"part":part,"centerLine":line,"ends":ends2})
        len1+= skew
        if len1 > len3:
            line= copyCenterLine(cl1,x1-len1,x1-len1+.2,
            x1-len1+len3-.2,x1-len1+len3)
            partLines.append({"part":part,"centerLine":line,"ends":3})
        else:
            line= copyCenterLine(cl1,x1-len1,x1-len1+.2,x1,x2)
            partLines.append({"part":part,"centerLine":line,"ends":ends1})

# makes a list of partial center lines for the parts needed to make
# a crossing model
def makeCrossingPartLines(shape):
    partLines= []
    cl1= shape["paths"][0]["centerLine"]
    cl2= shape["paths"][1]["centerLine"]
    addCrossingRail(partLines,"leftrail",cl1,cl2,-1,2,6,1)
    addCrossingRail(partLines,"rightrail",cl1,cl2,1,2,9,1)
    addCrossingRail(partLines,"leftrail",cl2,cl1,-1,2,9,1)
    addCrossingRail(partLines,"rightrail",cl2,cl1,1,2,6,1)
    addCrossingGuardRail(partLines,"leftguardrail",cl1,cl2,-1,shape,3,6,6)
    addCrossingGuardRail(partLines,"rightguardrail",cl1,cl2,1,shape,9,9,6)
    addCrossingGuardRail(partLines,"leftguardrail",cl2,cl1,-1,shape,9,9,3)
    addCrossingGuardRail(partLines,"rightguardrail",cl2,cl1,1,shape,3,6,6)
    copyPerp(cl2,cl1)
    partLines.append({"part":"ballast","centerLine":cl1,"ends":0})
    partLines.append({"part":"ties","centerLine":cl1,"ends":0})
    partLines.append({"part":"ballast","centerLine":cl2,"ends":0})
    partLines.append({"part":"ties","centerLine":cl2,"ends":0})
    return partLines

# makes a track model for the specified shape
def makeTrack(shape,profile,collection):
    paths= shape["paths"]
    for path in paths:
        cl= getCenterLine(path)
    paths.sort(key=functools.cmp_to_key(pathCenterLineCmp))
#    for path in paths:
#        printCenterLine(path["centerLine"])
    partLines= None
    if "mainroute" in shape:
        partLines= makeSwitchPartLines(shape)
    elif hasCrossing(paths):
        partLines= makeCrossingPartLines(shape)
    lods= profile["LODs"]
    cutoffs= set()
    for lod in lods:
        lod["objects"]= []
        cutoffs= cutoffs | { lod["CutoffRadius"] }
        if partLines:
            for pl in partLines:
                anim= None
                if "anim" in pl:
                    anim= pl["anim"]
                makeMesh(lod,shape,pl["part"],pl["centerLine"],pl["ends"],anim)
        elif "parts" in profile:
            for path in paths:
                cl= path["centerLine"]
                makeMesh(lod,shape,"rightrail",cl,0,None)
                makeMesh(lod,shape,"leftrail",cl,0,None)
                makeMesh(lod,shape,"ballast",cl,0,None)
                makeMesh(lod,shape,"ties",cl,0,None)
        else:
            for path in paths:
                cl= path["centerLine"]
                makeMesh(lod,shape,None,cl,0,None)
    for d in cutoffs:
        cname= "MAIN_%4.4d"%(d)
        col= bpy.data.collections.new(cname)
        collection.children.link(col)
        for lod in lods:
            if lod["CutoffRadius"] >= d:
                objects= lod["objects"]
                for obj in objects:
                    col.objects.link(obj)

def initSwitchStand(shape,shapefile):
    if "switchstand" in shape:
        switchstand= shape["switchstand"]
        filename= switchstand["file"]
        if not os.path.exists(filename):
            filename= os.path.join(os.path.dirname(shapefile),filename)
        if os.path.exists(filename):
            bpy.ops.wm.open_mainfile(filepath=filename)
        else:
            print("cannot find %s"%(filename))
            return
        obj= bpy.data.objects["switchstand"]
        obj.location= switchstand["position"]
        obj.rotation_euler= 0, 0, switchstand["rotation"]*math.pi/180
        if "derail" in shape:
            redtarget= bpy.data.objects["redtarget"]
            redtarget.rotation_euler= 0,0,math.pi/2
            redtarget.keyframe_insert("rotation_euler",frame=0)
            redtarget.rotation_euler= 0,0,0
            redtarget.keyframe_insert("rotation_euler",frame=1)
            redtarget.rotation_euler= 0,0,math.pi/2
        if "crankRotation" in switchstand:
            rot= switchstand["crankRotation"]*math.pi/180
            crank= bpy.data.objects["crank"]
            crank.rotation_euler= 0,0,math.pi*5/4+rot
            crank.keyframe_insert("rotation_euler",frame=0)
            crank.rotation_euler= 0,0,math.pi*3/4+rot
            crank.keyframe_insert("rotation_euler",frame=1)
            crank.rotation_euler= 0,0,math.pi*5/4+rot

def makeCollections(shape,profile,filename):
    initSwitchStand(shape,filename)
    maincol= bpy.data.collections.new("MAIN")
    bpy.context.scene.collection.children.link(maincol)
    makeTrack(shape,profile,maincol)
    if "switchstand" in bpy.data.collections:
        sscol= bpy.data.collections["switchstand"]
        for obj in sscol.objects:
            bpy.data.collections["MAIN_2000"].objects.link(obj)
            bpy.data.collections["MAIN_0700"].objects.link(obj)
            bpy.data.collections["MAIN_1000"].objects.link(obj)
            bpy.data.collections["MAIN_1200"].objects.link(obj)

class ShapeFileSelector(bpy.types.Operator):
    bl_idname= "ui.selecttrackshape"
    bl_description= "Select Track Shape JSON file"
    bl_label= "Load Shape"
    filepath: bpy.props.StringProperty(subtype="FILE_PATH")
    filter_glob: bpy.props.StringProperty(default="*.json",options={'HIDDEN'})
    def execute(self,context):
        shape= readjson(self.filepath)
        makeCollections(shape,profile,self.filepath)
        return {'FINISHED'}
    def invoke(self,context,event):
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

class ProfileFileSelector(bpy.types.Operator):
    bl_idname= "ui.selecttrackprofile"
    bl_description= "Select Track Profile JSON file"
    bl_label= "Load Profile"
    filepath: bpy.props.StringProperty(subtype="FILE_PATH")
    filter_glob: bpy.props.StringProperty(default="*.json",options={'HIDDEN'})
    def execute(self,context):
        global profile
        profile= readjson(self.filepath)
        bpy.ops.ui.selecttrackshape('INVOKE_DEFAULT')
        return {'FINISHED'}
    def invoke(self,context,event):
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

bpy.utils.register_class(ShapeFileSelector)
bpy.utils.register_class(ProfileFileSelector)

if "--" in sys.argv:
    args= sys.argv[sys.argv.index("--")+1:]
    shape= readjson(args[0])
    profile= readjson(args[1])
    makeCollections(shape,profile,args[0])
    bpy.ops.export.msts_s(filepath=shape["filename"])
#    bpy.ops.wm.save_as_mainfile(filepath=shape["filename"]+".blend")
else:
    bpy.ops.ui.selecttrackprofile('INVOKE_DEFAULT')
