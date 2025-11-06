// Copyright © 2025 Doug Jones
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

const { Shape } = require("./shape.js");
const { writeMstsShape } = require("./writemstsshape.js");
require("./csg.js");

// returns twice the area of a triangle
// positive if the points are listed in clockwise order, else negative
let triArea= function(x1,y1,x2,y2,x3,y3)
{
	return (x2-x1)*(y3-y1) - (x3-x1)*(y2-y1);
}

// finds the intersection between two line segments a-b and c-d.
// returns null if intersection is not on either segment
let segSegInt= function(a,b,c,d)
{
	let denom= a.x*(d.y-c.y) + b.x*(c.y-d.y) + c.x*(a.y-b.y) +
	  d.x*(b.y-a.y);
	if (denom == 0)
		return null; // parallel or collinear
	let s= (a.x*(d.y-c.y) + c.x*(a.y-d.y) + d.x*(c.y-a.y)) / denom;
	if (s<0 || s>1)
		return null; // not on segment a-b
	let t= -(a.x*(c.y-b.y) + b.x*(a.y-c.y) + c.x*(b.y-a.y)) / denom;
	if (t<0 || t>1)
		return null; // not on segment c-d
	let x= a.x + s*(b.x-a.x);
	let y= a.y + s*(b.y-a.y);
	return new CSG.Vector([x,y,0]);
}

// returns a direction vector given a heading angle
let headingVector= function(angle)
{
	let a= Math.PI*angle/180;
	let dx= Math.cos(a);
	let dy= Math.sin(a);
	return new CSG.Vector([dy,dx,0]);
}

// creates an array of center line points and perpendicular vectors
// for the specified path
let getCenterLine= function(path)
{
	let cl= [];
	let start= path.start;
	let p= new CSG.Vector([start[0],start[2],start[1]]);
	let heading= path.angle;
//	console.log("start "+p.x+" "+p.y+" "+p.z+" "+heading);
	cl.push({ "point":p, "perp":headingVector(heading+90) });
	for (let i=0; i<path.moves.length; i++) {
		let move= path.moves[i];
		let dir= headingVector(heading);
		if (move[1]==0) {
			p= p.plus(dir.times(move[0]));
			cl.push({ "point":p, "perp":
			  headingVector(heading+90) });
		} else {
			perp= headingVector(heading+90);
			let r= move[0];
			let d= Math.PI*move[1]/180;
			let m= Math.ceil(Math.abs(move[1]));
			if (move.length > 2)
				m= move[2];
			let angle= d/m;
			let t= Math.abs(r*Math.tan(angle/2));
			if (t < .01)
				m= 0;
			let h= 0;
			let cs= 1;
			let sn= 0;
			for (let j=0; j<m; j++) {
				p= p.plus(dir.times(t*cs));
				p= p.plus(perp.times(t*sn));
				h+= angle;
				cs= Math.cos(h);
				sn= Math.sin(h);
				p= p.plus(dir.times(t*cs));
				p= p.plus(perp.times(t*sn));
				cl.push({ "point":p, "perp":
				  headingVector(heading+90+180*h/Math.PI) })
			}
			heading= heading+180*h/Math.PI;
		}
	}
	path.centerLine= cl;
	return cl;
}

let makeStraight= function(x1,x2)
{
	let cl= [];
	let dir= headingVector(0);
	cl.push({ "point":dir.times(x1), "perp":headingVector(90) });
	cl.push({ "point":dir.times(x2), "perp":headingVector(90) });
	return cl;
}

// prints the given center line for debugging
let printCenterLine= function(centerLine)
{
	for (let i=0; i<centerLine.length; i++) {
		let p= centerLine[i].point;
		let perp= centerLine[i].perp;
		console.log("cl "+i+" "+p.x+" "+p.y+" "+perp.x+" "+perp.y);
	}
}

// path comparison function used to sort paths into left to right order
let pathCenterLineCmp= function(path1,path2)
{
	let cl1= path1.centerLine;
	let cl2= path2.centerLine;
	let p1= cl1[cl1.length-1].point;
	let p2= cl2[cl2.length-1].point;
	let a= triArea(0,0,p1.x,p1.y,p2.x,p2.y);
	if (a < 0)
		return -1;
	if (a > 0)
		return 1;
	return 0;
}

// returns a copy of the given centerline from dist1 to dist4
// adds points at dist2 and dist3 if necessary
let copyCenterLine= function(centerLine,dist1,dist2,dist3,dist4)
{
//	console.log("copycl "+dist1+" "+dist2+" "+dist3+" "+dist4);
	cl= [];
	dist= 0;
	for (let i=0; i<centerLine.length-1; i++) {
		let p1= centerLine[i].point;
		let p2= centerLine[i+1].point;
		let perp1= centerLine[i].perp;
		let perp2= centerLine[i+1].perp;
		let d= p2.minus(p1).length();
		if (i==0 && dist2 && dist3 && dist2<dist && dist<dist3) {
			cl.push({ "point":p1, "perp":perp1 });
		}
		if (dist1 && dist<=dist1 && dist+d>dist1) {
			let x= (dist1-dist)/d;
			let p= p1.lerp(p2,x);
			perp= perp1.lerp(perp2,x);
			cl.push({ "point":p, "perp":perp });
		}
		if (dist2 && dist<=dist2 && dist+d>dist2) {
			let x= (dist2-dist)/d;
			let p= p1.lerp(p2,x);
			let perp= perp1.lerp(perp2,x);
			cl.push({ "point":p, "perp":perp });
		}
		if (dist3 && dist<=dist3 && dist+d>dist3) {
			let x= (dist3-dist)/d;
			let p= p1.lerp(p2,x);
			let perp= perp1.lerp(perp2,x);
			cl.push({ "point":p, "perp":perp });
		}
		if (dist4 && dist<=dist4 && dist+d>dist4) {
			let x= (dist4-dist)/d;
			let p= p1.lerp(p2,x);
			let perp= perp1.lerp(perp2,x);
			cl.push({ "point":p, "perp":perp });
		}
		if (dist2 && dist3 && dist2<dist+d && dist+d<dist3) {
			cl.push({ "point":p2, "perp":perp2 });
		}
		dist= dist+d;
	}
	if (cl.length == 0)
		console.log("copycl zero");
	return cl;
}

// copies perpendicular information from cl2 to cl1
let copyPerp= function(cl1,cl2)
{
	for (let i=0; i<cl1.length; i++) {
		let p= cl1[i].point;
		let perp= cl1[i].perp;
		for (let j=0; j<5; j++) {
			let p11= p.plus(perp.times(100));
			let p12= p.minus(perp.times(100));
			for (let k=0; k<cl2.length-1; k++) {
				let p21= cl2[k].point;
				let p22= cl2[k+1].point;
				let pi= segSegInt(p11,p12,p21,p22);
				if (pi) {
					let perp1= cl2[k].perp;
					let perp2= cl2[k+1].perp;
					let d1= pi.minus(p21).length();
					let d2= pi.minus(p22).length();
					perp= perp1.lerp(perp2,d2/(d2+d1));
					break;
				}
			}
		}
		cl1[i].perp= perp;
	}
}

// finds the crossing point between two center lines each
// offset by the specified amount (negative offset is to the left)
// returns the intersection point and the distance down each line
// returns null if it is no crossing point
let findCrossing= function(cl1,cl2,offset1,offset2)
{
	let dist10= cl1[0].point.length();
	let dist20= cl2[0].point.length();
	let dist1= 0;
	let dist2= 0;
	let i1= 0;
	let i2= 0;
	while (i1<cl1.length-1 && i2<cl2.length-1) {
		let p11= cl1[i1].point.plus(cl1[i1].perp.times(offset1));
		let p12= cl1[i1+1].point.plus(
		  cl1[i1+1].perp.times(offset1));
		let p21= cl2[i2].point.plus(cl2[i2].perp.times(offset2));
		let p22= cl2[i2+1].point.plus(
		  cl2[i2+1].perp.times(offset2));
		let pi= segSegInt(p11,p12,p21,p22);
		if (pi) {
			let d1= pi.minus(p11).length();
			let d2= pi.minus(p21).length();
//			console.log("crossing "+offset1+" "+offset2+" "+
//			  pi.x+" "+pi.y+" "+i1+" "+i2+" "+
//			  dist1+" "+d1+" "+dist2+" "+d2);
			return { "pi":pi, "dist1":dist1+d1, "dist2":dist2+d2 };
		}
		let d1= cl1[i1+1].point.minus(cl1[i1].point).length();
		let d2= cl2[i2+1].point.minus(cl2[i2].point).length();
//		console.log("nocrossing "+i1+" "+i2+" "+d1+" "+d2);
		if (dist10+dist1+d1 < dist20+dist2+d2) {
			i1= i1+1;
			dist1= dist1+d1;
		} else {
			i2= i2+1;
			dist2= dist2+d2;
		}
//		console.log("no crossing "+offset1+" "+offset2);
	}
	return null;
}

// makes a mesh and object for a single part of the track model
// ends is a bit flag that controls taper at end of rail
//  bit 1 is near end taper to inside
//  bit 2 is far end taper to inside
//  bit 4 is near end taper to outside
//  bit 8 is far end taper to outside
let makeMesh= function(lod,shape,part,centerLine,ends,anim,shapeFile)
{
	let pivot= new CSG.Vector([0,0,0]);
	if (anim)
		pivot= new CSG.Vector(anim.pivot);
	let coords= [];
	let uvs= [];
	let faces= [];
	let vi= 0;
	let polylines= lod.Polylines;
	for (let i=0; i<polylines.length; i++) {
		let polyline= polylines[i];
		if (part && polyline.part!=part)
			continue;
		let dtc= polyline.DeltaTexCoord;
		let point0= centerLine[0].point;
		let dist= 0;
		for (let j=0; j<centerLine.length; j++) {
			if (part && part=="end" && j>0 &&
			  j<centerLine.length-1)
				continue;
			let point= centerLine[j].point;
			let perp= centerLine[j].perp;
			dist= dist + point.minus(point0).length();
			let verts= null;
			if (j==0 && polyline.verticesi && (ends&1)!=0) {
				verts= polyline.verticesi;
			} else if (j==0 && polyline.verticeso && (ends&4)!=0) {
				verts= polyline.verticeso;
			} else if (j==centerLine.length-1 &&
			  polyline.verticesi && (ends&2)!=0) {
				verts= polyline.verticesi;
			} else if (j==centerLine.length-1 &&
			  polyline.verticeso && (ends&8)!=0) {
				verts= polyline.verticeso;
			} else {
				verts= polyline.Vertices;
			}
			let nverts= verts.length;
			for (let k=0; k<verts.length; k++) {
				let pos= verts[k].Position;
				let texc= verts[k].TexCoord;
				let p= point.plus(perp.times(pos[0])).plus(
				  new CSG.Vector([0,0,pos[1]])).minus(pivot);
				coords.push(p);
				let u= texc[0]+dist*dtc[0];
				let v= 1-(texc[1]+dist*dtc[1]);
				uvs.push({u:u, v:v});
			}
			if (part && part=="end") {
				let face= [];
				for (let k=0; k<verts.length; k++) {
					if (j>0) {
						face.push(vi+nverts-1-k);
					} else {
						face.push(vi+k);
					}
				}
				faces.push(face);
			} else {
				for (let k=0; k<verts.length; k++) {
					if (j>0 && k>0) {
						vij= vi+k-1;
						face= [vij-nverts,vij-nverts+1,
						  vij+1,vij];
						faces.push(face);
					}
				}
			}
			point0= point;
			vi= vi+nverts;
		}
	}
	if (coords.length == 0)
		return;
	let name0= lod.Name.replace(/ /g,"_");
	let name= name0;
	for (let i=1; i<100 && shapeFile.meshMap[name]; i++)
		name= name0 + i;
	let texture= lod.TexName;
	let mesh= shapeFile.addMesh(name);
	for (let i=0; i<coords.length; i++) {
		let c= coords[i];
		let uv= uvs[i];
		mesh.addVertex(c.x,c.y,c.z);
		mesh.addVertexUV(i,uv.u,uv.v);
//		console.log(" "+i+" "+c.x.toFixed(3)+" "+c.y.toFixed(3)+" "+
//		  c.z.toFixed(3)+" "+uv.u.toFixed(4)+" "+uv.v.toFixed(4));
	}
	for (let i=0; i<faces.length; i++) {
		let face= faces[i];
		mesh.addFace(face);
	}
	let obj= shapeFile.addObject(name,name,texture);
	lod.objects.push(obj);
	if (anim) {
		obj.setPosition(pivot.x, pivot.y, pivot.z);
		obj.addRotationAnimation(0, 0, 0, anim.angle0);
		obj.addRotationAnimation(1, 0, 0, anim.angle1);
	}
	obj.lodbias= lod.MipMapLevelOfDetailBias;
	if (lod.LightModelName == "OptSpecular25")
		obj.lighting= "SPECULAR25";
	else if (lod.LightModelName == "OptSpecular750")
		obj.lighting= "SPECULAR750";
	if (lod.ShaderName.substr(0,6) == "BlendA")
		obj.transparency= "ALPHA";
}

// makes a list of partial center lines for the parts needed to make
// a switch model
let makeSwitchPartLines= function(shape,profile)
{
	let partLines= [];
	let cl1= shape.paths[0].centerLine;
	let cl2= shape.paths[1].centerLine;
	let g= profile.gauge;
	let rh= profile.railhead;
	let f= profile.flangeway;
	let stub= shape.stub;
	let derail= shape.derail || "";
	let grlen1= 2;
	let grlen2= 3;
	if (shape.guardRailLengths) {
	   grlen1= shape.guardRailLengths[0];
	   grlen2= shape.guardRailLengths[1];
	}
	let points0= findCrossing(cl1,cl2,0,0);
	let points= findCrossing(cl1,cl2,(f+rh)/2,-(f+rh)/2);
	let frogPoint= findCrossing(cl1,cl2,g/2,-g/2);
	let frogPointRH= findCrossing(cl1,cl2,g/2+rh,-g/2-rh);
	let frogStartL= findCrossing(cl1,cl2,g/2,-g/2+f);
	let frogStartLRH= findCrossing(cl1,cl2,g/2+rh,-g/2+f);
	let frogStartR= findCrossing(cl1,cl2,g/2-f,-g/2);
	let frogStartRRH= findCrossing(cl1,cl2,g/2-f,-g/2-rh);
	let frogStart= findCrossing(cl1,cl2,g/2-f/2,-g/2+f/2);
	let frogStartRH= findCrossing(cl1,cl2,g/2-f/2+rh/2,-g/2+f/2-rh/2);
	let animL= null;
	let animR= null;
	if (points0 && points) {
		let d= points.dist1-points0.dist1;
		let a= Math.asin((f+rh)/d);
		if (stub) {
			let pivot1= new CSG.Vector(points0.pi).plus(
			  new CSG.Vector([-g/2,0,0]));
			let pivot2= new CSG.Vector(points0.pi).plus(
			  new CSG.Vector([g/2,0,0]));
			if (shape.mainroute && points.pi.x<0) {
				animL= {"pivot":pivot1,"angle0":0,"angle1":a};
				animR= {"pivot":pivot2,"angle0":0,"angle1":a};
			} else if (shape.mainroute) {
				animL= {"pivot":pivot1,"angle0":-a,"angle1":0};
				animR= {"pivot":pivot2,"angle0":-a,"angle1":0};
			} else if (points.pi.x<0) {
				animL= {"pivot":pivot1,"angle0":a,"angle1":0};
				animR= {"pivot":pivot2,"angle0":a,"angle1":0};
			} else {
				animL= {"pivot":pivot1,"angle0":0,"angle1":-a};
				animR= {"pivot":pivot2,"angle0":0,"angle1":-a};
			}
		} else {
			let pivot1= new CSG.Vector(points.pi).plus(
			  new CSG.Vector([-g/2,0,0]));
			let pivot2= new CSG.Vector(points.pi).plus(
			  new CSG.Vector([g/2,0,0]));
			if (shape.mainroute) {
				animL= {"pivot":pivot1,"angle0":0,"angle1":a};
				animR= {"pivot":pivot2,"angle0":-a,"angle1":0};
			} else {
				animL= {"pivot":pivot1,"angle0":a,"angle1":0};
				animR= {"pivot":pivot2,"angle0":0,"angle1":-a};
			}
		}
	}
	if (frogStart) {
		let x= frogStart.dist1;
		let line= copyCenterLine(cl1,x-.1,x,x+grlen1-.2,x+grlen1);
		partLines.push({"part":"rightguardrail","centerLine":line,
		  "ends":3});
		x= frogStart.dist2;
		line= copyCenterLine(cl2,x-.1,x,x+grlen1-.2,x+grlen1);
		partLines.push({"part":"leftguardrail","centerLine":line,
		  "ends":3});
	}
	if (frogPoint) {
		let x= frogPoint.dist1;
		let line= copyCenterLine(cl1,x+grlen1-grlen2,
		  x+grlen1-grlen2+.2,x+grlen1-.2,x+grlen1);
		partLines.push({"part":"leftguardrail","centerLine":line,
		  "ends":3});
		x= frogPoint.dist2;
		line= copyCenterLine(cl2,x+grlen1-grlen2,x+grlen1-grlen2+.2,
		  x+grlen1-.2,x+grlen1);
		partLines.push({"part":"rightguardrail","centerLine":line,
		  "ends":3});
	}
	if (stub && points0 && points) {
		let y= points0.dist1;
		let x= points.dist1;
		if (y>0) {
			let line= copyCenterLine(cl1,null,0,y,null);
			partLines.push({"part":"leftrail","centerLine":line,
			  "ends":0});
			line= copyCenterLine(cl2,null,0,y,null);
			partLines.push({"part":"rightrail","centerLine":line,
			  "ends":0});
		}
		let line= copyCenterLine(cl1,null,x,1000,null);
		partLines.push({"part":"leftrail","centerLine":line,"ends":0});
		line= copyCenterLine(cl2,null,x,1000,null);
		partLines.push({"part":"rightrail","centerLine":line,"ends":0});
	} else {
		partLines.push({"part":"leftrail","centerLine":cl1,"ends":0});
		partLines.push({"part":"rightrail","centerLine":cl2,"ends":0});
	}
	if (derail != "left") {
		if (points0 && points) {
			let y= points0.dist1;
			let x= points.dist1;
			if (y==0)
				y=.001;
			if (stub) {
				let line= makeStraight(y,x);
				partLines.push({"part":"rightrail",
				  "centerLine":line,"ends":0,"anim":animR});
			} else {
				let line= copyCenterLine(cl1,y,(x+y)/2,x,null);
				partLines.push({"part":"rightrail",
				  "centerLine":line,"ends":1,"anim":animR});
			}
			if (frogStartL) {
				let y= frogStartL.dist1;
				let z= frogStartLRH.dist1;
				let line= copyCenterLine(cl1,null,x,y,z);
				partLines.push({"part":"rightrail",
				  "centerLine":line,"ends":8});
			} else {
				let line= copyCenterLine(cl1,null,x,1000,null);
				partLines.push({"part":"rightrail",
				  "centerLine":line,"ends":0});
			}
		} else if (frogStartL) {
			let x= -1;
			let y= frogStartL.dist1;
			let z= frogStartLRH.dist1;
			let line= copyCenterLine(cl1,null,x,y,z);
			partLines.push({"part":"rightrail","centerLine":line,
			  "ends":8});
		} else {
			partLines.push({"part":"rightrail","centerLine":cl1,
			  "ends":0});
		}
	}
	if (frogPoint) {
		let x= frogPoint.dist1;
		let y= frogPointRH.dist1;
		let line= copyCenterLine(cl1,x,y,1000,null);
		partLines.push({"part":"rightrail","centerLine":line,"ends":1});
	}
	if (derail != "right") {
		if (points0 && points) {
			let y= points0.dist2;
			let x= points.dist2;
			if (y==0)
			   	y=.001;
			if (stub) {
				let line= makeStraight(y,x);
				partLines.push({"part":"leftrail",
				  "centerLine":line,"ends":0,"anim":animL});
			} else {
				let line= copyCenterLine(cl2,y,(x+y)/2,x,null);
				partLines.push({"part":"leftrail",
				  "centerLine":line,"ends":1,"anim":animL});
			}
			if (frogStartR) {
				let y= frogStartR.dist2;
				let z= frogStartRRH.dist2;
				let line= copyCenterLine(cl2,null,x,y,z);
				partLines.push({"part":"leftrail",
				  "centerLine":line,"ends":8});
			} else {
				let line= copyCenterLine(cl2,null,x,1000,null);
				partLines.push({"part":"leftrail",
				  "centerLine":line,"ends":0});
			}
		} else if (frogStartR) {
			let x= -1;
			let y= frogStartR.dist2;
			let z= frogStartRRH.dist2;
			line= copyCenterLine(cl2,null,x,y,z);
			partLines.push({"part":"leftrail",
			  "centerLine":line,"ends":8});
		} else {
			partLines.push({"part":"leftrail","centerLine":cl2,
			  "ends":0});
		}
	}
	if (frogPoint) {
		let x= frogPoint.dist2;
		let y= frogPointRH.dist2;
		let line= copyCenterLine(cl2,x,y,1000,null);
		partLines.push({"part":"leftrail","centerLine":line,"ends":1});
	}
	if (shape.paths[0].copyties) {
		cl1= copyCenterLine(cl1,null,-1000,1000,null);
		copyPerp(cl1,cl2);
	}
	if (shape.paths[1].copyties) {
		cl2= copyCenterLine(cl2,null,-1000,1000,null);
		copyPerp(cl2,cl1);
	}
	if (derail != "left") {
		partLines.push({"part":"ballast","centerLine":cl1,"ends":0});
		partLines.push({"part":"ties","centerLine":cl1,"ends":0});
	}
	if (derail != "right") {
		partLines.push({"part":"ballast","centerLine":cl2,"ends":0});
		partLines.push({"part":"ties","centerLine":cl2,"ends":0});
	}
	return partLines;
}

// returns true if paths has two paths that cross
let hasCrossing= function(paths)
{
	if (paths.length < 2)
		return false;
	cl1= paths[0].centerLine;
	cl2= paths[1].centerLine;
	p10= cl1[0].point;
	p11= cl1[cl1.length-1].point;
	p20= cl2[0].point;
	p21= cl2[cl2.length-1].point;
	a1= triArea(p10.x,p10.y,p11.x,p11.y,p20.x,p20.y);
	a2= triArea(p10.x,p10.y,p11.x,p11.y,p21.x,p21.y);
	if (a1>.1 && a2<-.1)
		return true;
	if (a1<-.1 && a2>.1)
		return true;
	return false;
}

// adds parts to partLines for a single crossing rail
// rail follows cl1 offset to side defined by sign
let addCrossingRail= function(partLines,part,cl1,cl2,sign,ends1,ends2,ends3,
  profile)
{
//	console.log("addcrossingrail "+part+" "+sign);
	let g= profile.gauge/2;
	let rh= profile.railhead;
	let f= profile.flangeway;
	let x1= findCrossing(cl1,cl2,sign*(g+rh),g+rh).dist1;
	let x2= findCrossing(cl1,cl2,sign*g,g).dist1;
	let x3= findCrossing(cl1,cl2,sign*(g+rh),g-f).dist1;
	let x4= findCrossing(cl1,cl2,sign*g,g-f).dist1;
	let x5= findCrossing(cl1,cl2,sign*(g+rh),-g+f).dist1;
	let x6= findCrossing(cl1,cl2,sign*g,-g+f).dist1;
	let x7= findCrossing(cl1,cl2,sign*g,-g).dist1;
	let x8= findCrossing(cl1,cl2,sign*(g+rh),-g-rh).dist1;
	let a= [x1,x2,x3,x4,x5,x6,x7,x8].sort(function(a,b){return a-b;});
	line= copyCenterLine(cl1,null,-1,a[0],a[1]);
	partLines.push({"part":part,"centerLine":line,"ends":ends1});
	line= copyCenterLine(cl1,a[2],a[3],a[4],a[5]);
	partLines.push({"part":part,"centerLine":line,"ends":ends2});
	line= copyCenterLine(cl1,a[6],a[7],1000,null);
	partLines.push({"part":part,"centerLine":line,"ends":ends3});
}

// adds parts to partLines for a single crossing guard rail
// rail follows cl1 offset to side defined by sign
let addCrossingGuardRail= function(partLines,part,cl1,cl2,sign,
  shape,profile,ends1,ends2,ends3)
{
//	console.log("addcrossingguardrail "+part+" "+sign);
	let g= profile.gauge/2;
	let rh= profile.railhead;
	let f= profile.flangeway;
	let x1= findCrossing(cl1,cl2,sign*(g-f-rh),g+rh).dist1;
	let x2= findCrossing(cl1,cl2,sign*(g-f),g+rh).dist1;
	let x3= findCrossing(cl1,cl2,sign*(g-f-rh),g-f).dist1;
	let x4= findCrossing(cl1,cl2,sign*(g-f),g-f).dist1;
	let x5= findCrossing(cl1,cl2,sign*(g-f-rh),-g+f).dist1;
	let x6= findCrossing(cl1,cl2,sign*(g-f),-g+f).dist1;
	let x7= findCrossing(cl1,cl2,sign*(g-f),-g-rh).dist1;
	let x8= findCrossing(cl1,cl2,sign*(g-f-rh),-g-rh).dist1;
	let skew= x3 - findCrossing(cl1,cl2,-sign*(g-f),g-f).dist1;
	let a= [x1,x2,x3,x4,x5,x6,x7,x8].sort(function(a,b){return a-b;});
	x1= a[0];
	x2= a[1];
	x3= a[2];
	x4= a[3];
	x5= a[4];
	x6= a[5];
	x7= a[6];
	x8= a[7];
	let len1= 1;
	let len2= 2;
	let len3= 2.5;
	if (shape.guardRailLengths) {
		len1= shape.guardRailLengths[0];
		len2= shape.guardRailLengths[1];
		len3= shape.guardRailLengths[2];
	}
	if (skew < 0) {
		let line= copyCenterLine(cl1,x1-len1,x1-(len1-.2),x1,x2);
		partLines.push({"part":part,"centerLine":line,"ends":ends1});
		if (x6-x3 > len2) {
			line= copyCenterLine(cl1,x6-len2,x6-len2+.2,x5,x6);
			partLines.push({"part":part,"centerLine":line,"ends":3});
		} else {
			line= copyCenterLine(cl1,x3,x4,x5,x6);
			partLines.push({"part":part,"centerLine":line,"ends":ends2});
		}
		len1-= skew;
		if (len1 > len3) {
			line= copyCenterLine(cl1,x7+len1-len3,x7+len1-len3+.2,
			x7+len1-.2,x7+len1);
			partLines.push({"part":part,"centerLine":line,"ends":3});
		} else {
			line= copyCenterLine(cl1,x7,x8,x7+len1-.2,x7+len1);
			partLines.push({"part":part,"centerLine":line,"ends":ends3});
		}
	} else {
		let line= copyCenterLine(cl1,x7,x8,x7+len1-.2,x7+len1);
		partLines.push({"part":part,"centerLine":line,"ends":ends3});
		if (x6-x3 > len2) {
			line= copyCenterLine(cl1,x3,x4,x3+len2-.2,x3+len2);
			partLines.push({"part":part,"centerLine":line,"ends":3});
		} else {
			line= copyCenterLine(cl1,x3,x4,x5,x6);
			partLines.push({"part":part,"centerLine":line,"ends":ends2});
		}
		len1+= skew;
		if (len1 > len3) {
			line= copyCenterLine(cl1,x1-len1,x1-len1+.2,
			x1-len1+len3-.2,x1-len1+len3);
			partLines.push({"part":part,"centerLine":line,"ends":3});
		} else {
			line= copyCenterLine(cl1,x1-len1,x1-len1+.2,x1,x2);
			partLines.push({"part":part,"centerLine":line,"ends":ends1});
		}
	}
}

// makes a list of partial center lines for the parts needed to make
// a crossing model
let makeCrossingPartLines= function(shape,profile)
{
	let partLines= [];
	let cl1= shape.paths[0].centerLine;
	let cl2= shape.paths[1].centerLine;
	try {
		addCrossingRail(partLines,"leftrail",cl1,cl2,-1,2,6,1,profile);
		addCrossingRail(partLines,"rightrail",cl1,cl2,1,2,9,1,profile);
		addCrossingRail(partLines,"leftrail",cl2,cl1,-1,2,9,1,profile);
		addCrossingRail(partLines,"rightrail",cl2,cl1,1,2,6,1,profile);
		addCrossingGuardRail(partLines,"leftguardrail",cl1,cl2,-1,
		  shape,profile,3,6,6);
		addCrossingGuardRail(partLines,"rightguardrail",cl1,cl2,1,
		  shape,profile,9,9,6);
		addCrossingGuardRail(partLines,"leftguardrail",cl2,cl1,-1,
		  shape,profile,9,9,3);
		addCrossingGuardRail(partLines,"rightguardrail",cl2,cl1,1,
		  shape,profile,3,6,6);
		partLines.push({"part":"ballast","centerLine":cl1,"ends":0});
		partLines.push({"part":"ties","centerLine":cl1,"ends":0});
		partLines.push({"part":"ballast","centerLine":cl2,"ends":0});
		partLines.push({"part":"ties","centerLine":cl2,"ends":0});
	} catch (e) {
		console.log("cannot find all crossings"+e+" "+partLines.length);
		return null;
	}
	return partLines;
}

// reverse centerline && flip perpendiculars
let flipCenterLine= function(cl)
{
	cl.reverse();
	for (let i=0; i<cl.length; i++) {
		let perp= cl[i].perp;
		perp.x*= -1;
		perp.y*= -1;
	}
}

// makes a track model for the specified shape
let makeTrack= function(shape,profile,shapeFile)
{
	let paths= shape.paths;
	for (let i=0; i<paths.length; i++) {
		let path= paths[i];
		cl= getCenterLine(path);
	}
	if (hasCrossing(paths)) {
		let angle= paths[1].angle;
		if (angle<-90 || angle>90) {
			flipCenterLine(paths[1].centerLine);
		}
	}
	let tunnel= null;
	if (shape.tunnel) {
		tunnel= shape.tunnel;
		if (tunnel.path) {
			getCenterLine(tunnel.path);
		} else {
			tunnel.path= paths[0];
		}
	}
	let ends= shape.ends;
	paths.sort(pathCenterLineCmp);
	let partLines= null;
	if (shape.hasOwnProperty("mainroute")) {
		partLines= makeSwitchPartLines(shape,profile);
	} else if (hasCrossing(paths)) {
		partLines= makeCrossingPartLines(shape,profile);
	}
	let lods= profile.LODs;
	for (let i=0; i<lods.length; i++) {
		let lod= lods[i];
		lod.objects= [];
		if (partLines) {
			for (let j=0; j<partLines.length; j++) {
				let pl= partLines[j];
				makeMesh(lod,shape,pl.part,pl.centerLine,
				  pl.ends,pl.anim,shapeFile);
			}
		} else if (profile.parts) {
			for (let i=0; i<paths.length; i++) {
				let path= paths[i];
				let cl= path.centerLine;
				makeMesh(lod,shape,"rightrail",cl,0,null,
				  shapeFile);
				makeMesh(lod,shape,"leftrail",cl,0,null,
				  shapeFile);
				makeMesh(lod,shape,"ballast",cl,0,null,
				  shapeFile);
				makeMesh(lod,shape,"ties",cl,0,null,
				  shapeFile);
				if (ends) {
					makeMesh(lod,shape,"end",cl,0,null,
					  shapeFile);
				}
			}
			if (tunnel) {
				let path= tunnel.path;
				let cl= path.centerLine;
				makeMesh(lod,shape,tunnel.part,cl,0,null,
				  shapeFile);
			}
		} else {
			for (let i=0; i<paths.length; i++) {
				let path= paths[i];
				let cl= path.centerLine;
				makeMesh(lod,shape,null,cl,0,null,
				  shapeFile);
			}
		}
	}
	let cutoffs= [];
	for (let i=0; i<lods.length; i++)
		cutoffs.push(parseFloat(lods[i].CutoffRadius));
	cutoffs.sort(function(a,b){return a-b;});
	for (let i=0; i<cutoffs.length; i++) {
		let d= cutoffs[i];
		if (i>0 && d==cutoffs[i-1])
			continue;
		let names= [];
		for (let j=0; j<lods.length; j++) {
			let lod= lods[j];
			if (lod.CutoffRadius >= d) {
				objects= lod.objects;
				for (let k=0; k<objects.length; k++) {
					let obj= objects[k];
					names.push(obj.name);
				}
			}
		}
		shapeFile.addLod(d,names);
	}
}

let makeTrackShape= function(trackShape,profile)
{
	let shapeFile= new Shape(trackShape.filename);
	makeTrack(trackShape,profile,shapeFile);
	let data= shapeFile.getData();
	writeMstsShape(data);
}

exports.makeTrackShape= makeTrackShape;
