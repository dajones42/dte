// Copyright © 2023 Doug Jones
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

// library for creating json file used by js2s.py to create MSTS/OR shape file

const fs= require('fs');

// data for a Blender mesh
class Mesh {
	constructor() {
		this.coords= [];
		this.faces= [];
	}
	addVertex(x,y,z) {
		this.coords.push([x,y,z]);
	}
	// add face as array of vertex indexs in ccw order
	// must be convex and in a plane
	addFace(face) {
		this.faces.push(face);
	}
	// add texture coordinates for vertex index
	addVertexUV(index,u,v) {
		if (!this.vertexUVs)
			this.vertexUVs= [];
		this.vertexUVs[index]= [u,v];
	}
	// add texture coordinates for face index
	// uvs should be an array of uv arrays
	addFaceUVs(index,uvs) {
		if (!this.faceUVs)
			this.faceUVs= [];
		if (index >= 0) {
			this.faceUVs[index]= uvs;
		} else {
			for (let i=0; i<this.faces.length; i++)
				this.faceUVs[i]= uvs;
		}
	}
	addRectFaceUVs(index,u0,v0,du,dv) {
		this.addFaceUVs(index,
		  [[u0,v0+dv],[u0,v0],[u0+du,v0],[u0+du,v0+dv]]);
	}
	addSmoothFace(index) {
		if (!this.smoothFaces)
			this.smoothFaces= [];
		this.smoothFaces.push(index);
	}
	// creates a new Mesh that is a copy of this one
	clone() {
		let copy= new Mesh();
		for (let i=0; i<this.coords.length; i++) {
			let v= this.coords[i];
			copy.coords.push([v[0],v[1],v[2]]);
		}
		if (this.smoothFaces)
			copy.smoothFaces= [];
		for (let i=0; i<this.faces.length; i++) {
			let f= this.faces[i];
			if (f) {
				let face= [];
				for (let j=0; j<f.length; j++)
					face.push(f[j]);
				copy.faces.push(face);
				if (this.smoothFaces &&
				  this.smoothFaces.indexOf(i)>=0)
					copy.smoothFaces.push(
					  copy.faces.length-1);
			}
		}
		if (this.vertexUVs) {
			copy.vertexUVs= [];
			for (let i=0; i<this.vertexUVs.length; i++) {
				let uv= this.vertexUVs[i];
				copy.vertexUVs.push([uv[0],uv[1]]);
			}
		}
		if (this.faceUVs) {
			copy.faceUVs= [];
			for (let i=0; i<this.faceUVs.length; i++) {
				if (this.faces[i]) {
					let fuvs= this.faceUVs[i];
					let faceUVs= [];
					for (let j=0; j<fuvs.length; j++) {
						let uv= fuvs[j];
						faceUVs.push([uv[0],uv[1]]);
					}
					copy.faceUVs.push(faceUVs);
				}
			}
		}
		if (this.smooth)
			copy.smooth= true;
		return copy;
	}
	// adds another mesh to this one
	add(other) {
		let v0= this.coords.length;
		for (let i=0; i<other.coords.length; i++) {
			let v= other.coords[i];
			this.coords.push([v[0],v[1],v[2]]);
		}
		if (other.smoothFaces && !this.smoothFaces)
			this.smoothFaces= [];
		for (let i=0; i<other.faces.length; i++) {
			let f= other.faces[i];
			if (f) {
				let face= [];
				for (let j=0; j<f.length; j++)
					face.push(f[j]+v0);
				this.faces.push(face);
				if (other.smoothFaces &&
				  other.smoothFaces.indexOf(i)>=0)
					this.smoothFaces.push(
					  this.faces.length-1);
			}
		}
		if (this.vertexUVs && other.vertexUVs) {
			for (let i=0; i<other.vertexUVs.length; i++) {
				let uv= other.vertexUVs[i];
				this.vertexUVs.push(uv);
			}
		}
		if (this.faceUVs && other.faceUVs) {
			for (let i=0; i<other.faceUVs.length; i++) {
				if (other.faces[i]) {
					let uv= other.faceUVs[i];
					this.faceUVs.push(uv);
				}
			}
		}
	}
	// scale all coordinates by the specified multipliers
	scale(sx,sy,sz) {
		for (let i=0; i<this.coords.length; i++) {
			let v= this.coords[i];
			v[0]*= sx;
			v[1]*= sy;
			v[2]*= sz;
		}
		return this;
	}
	// shift all coordinates by the specified deltas
	translate(dx,dy,dz) {
		for (let i=0; i<this.coords.length; i++) {
			let v= this.coords[i];
			v[0]+= dx;
			v[1]+= dy;
			v[2]+= dz;
		}
		return this;
	}
	// rotate all coordinates about the X axis
	rotateX(degrees) {
		let cs= Math.cos(degrees*Math.PI/180);
		let sn= Math.sin(degrees*Math.PI/180);
		for (let i=0; i<this.coords.length; i++) {
			let v= this.coords[i];
			let y= cs*v[1] - sn*v[2];
			let z= sn*v[1] + cs*v[2];
			v[1]= y;
			v[2]= z;
		}
		return this;
	}
	// rotate all coordinates about the Y axis
	rotateY(degrees) {
		let cs= Math.cos(degrees*Math.PI/180);
		let sn= Math.sin(degrees*Math.PI/180);
		for (let i=0; i<this.coords.length; i++) {
			let v= this.coords[i];
			let x= cs*v[0] + sn*v[2];
			let z= -sn*v[0] + cs*v[2];
			v[0]= x;
			v[2]= z;
		}
		return this;
	}
	// rotate all coordinates about the Z axis
	rotateZ(degrees) {
		let cs= Math.cos(degrees*Math.PI/180);
		let sn= Math.sin(degrees*Math.PI/180);
		for (let i=0; i<this.coords.length; i++) {
			let v= this.coords[i];
			let x= cs*v[0] - sn*v[1];
			let y= sn*v[0] + cs*v[1];
			v[0]= x;
			v[1]= y;
		}
		return this;
	}
}

class Box extends Mesh {
	constructor(len,wid,ht) {
		super();
		this.addVertex(-len/2,-wid/2,ht/2);
		this.addVertex(len/2,-wid/2,ht/2);
		this.addVertex(len/2,wid/2,ht/2);
		this.addVertex(-len/2,wid/2,ht/2);
		this.addFace([0,1,2,3]);
		if (ht > 0) {
			this.addVertex(-len/2,-wid/2,-ht/2);
			this.addVertex(len/2,-wid/2,-ht/2);
			this.addVertex(len/2,wid/2,-ht/2);
			this.addVertex(-len/2,wid/2,-ht/2);
			this.addFace([4,5,1,0]);
			this.addFace([5,6,2,1]);
			this.addFace([6,7,3,2]);
			this.addFace([7,4,0,3]);
			this.addFace([7,6,5,4]);
		}
	}
	addBottomTaper(dx,dy) {
		this.coords[4][0]-= dx;
		this.coords[4][1]-= dy;
		this.coords[5][0]+= dx;
		this.coords[5][1]-= dy;
		this.coords[6][0]+= dx;
		this.coords[6][1]+= dy;
		this.coords[7][0]-= dx;
		this.coords[7][1]+= dy;
	}
	// shift bottom coordinates by the specified deltas
	translateBottom(dx,dy,dz) {
		let n= this.coords.length/2;
		for (let i=0; i<n; i++) {
			let v= this.coords[i+n];
			v[0]+= dx;
			v[1]+= dy;
			v[2]+= dz;
		}
		return this;
	}
	addRectFaceUVs(index,u0,v0,du,dv) {
		this.addFaceUVs(index,
		  [[u0,v0],[u0+du,v0],[u0+du,v0+dv],[u0,v0+dv]]);
	}
}

class Cylinder extends Mesh {
	constructor(radius,ht,nseg) {
		super();
		let z= ht/2;
		let face= [];
		for (let i=0; i<nseg; i++) {
			let x= radius*Math.cos(i/nseg*2*Math.PI);
			let y= radius*Math.sin(i/nseg*2*Math.PI);
			this.addVertex(x,y,z);
			face.push(i);
		}
		this.addFace(face);
		if (ht > 0) {
			z= -ht/2;
			face= [];
			for (let i=0; i<nseg; i++) {
				let x= radius*Math.cos(i/nseg*2*Math.PI);
				let y= radius*Math.sin(i/nseg*2*Math.PI);
				this.addVertex(x,y,z);
				face.push(i+nseg);
			}
			this.addFace(face.reverse());
			for (let i=0; i<nseg; i++) {
				let i1= (i+1)%nseg;
				this.addFace([i,i+nseg,i1+nseg,i1]);
				this.addSmoothFace(this.faces.length-1);
			}
		}
		this.smooth= true;
	}
	addBottomTaper(frac) {
		let n= this.coords.length/2;
		for (let i=0; i<n; i++) {
			this.coords[i+n][0]*= frac;
			this.coords[i+n][1]*= frac;
		}
	}
	// shift bottom coordinates by the specified deltas
	translateBottom(dx,dy,dz) {
		let n= this.coords.length/2;
		for (let i=0; i<n; i++) {
			let v= this.coords[i+n];
			v[0]+= dx;
			v[1]+= dy;
			v[2]+= dz;
		}
		return this;
	}
	// add UVs for top or bottom circular face
	addCFaceUVs(index,u0,u1,v0,v1) {
		let n= this.coords.length;
		if (this.faces.length > 1)
			n/= 2;
		let uvs= [];
		let uc= .5*(u1+u0);
		let ur= .5*(u1-u0);
		let vc= .5*(v1+v0);
		let vr= .5*(v1-v0);
		for (let i=0; i<n; i++) {
			let u= uc + ur*Math.cos(i/n*2*Math.PI);
			let v= vc + vr*Math.sin(i/n*2*Math.PI);
			uvs.push([u,v]);
		}
		this.addFaceUVs(index,uvs);
	}
	addTopUVs(u0,u1,v0,v1) {
		this.addCFaceUVs(0,u0,u1,v0,v1);
	}
	addBottomUVs(u0,u1,v0,v1) {
		this.addCFaceUVs(1,u0,u1,v0,v1);
	}
	addSideUVs(u0,u1,v0,v1) {
		let n= this.coords.length/2;
		for (let i=0; i<n; i++) {
			let ui= u0 + (u1-u0)*i/n;
			let ui1= u0 + (u1-u0)*(i+1)/n;
			this.addFaceUVs(i+2,
			  [[ui,v0],[ui,v1],[ui1,v1],[ui1,v0]]);
		}
	}
}

class Turning extends Mesh {
	constructor(nseg,points) {
		super();
		let lengths= [0];
		let p0= points[0];
		let maxX= p0[0];
		let sumLengths= 0;
		for (let i=1; i<points.length; i++) {
			let p1= points[i];
			let dx= p1[0]-p0[0];
			let dy= p1[1]-p0[1];
			let len= Math.sqrt(dx*dx+dy*dy);
			sumLengths+= len;
			lengths.push(len);
			if (maxX < p1[0])
				maxX= p1[0];
			p0= p1;
		}
		let v= 0;
		let vs= [];
		for (let i=0; i<points.length; i++) {
			let p= points[i];
			let r= p[0];
			let y= p[1];
			for (let j=0; j<nseg; j++) {
				let x= r*Math.cos(j/nseg*2*Math.PI);
				let z= r*Math.sin(j/nseg*2*Math.PI);
				this.addVertex(x,y,z);
			}
			v+= lengths[i]/sumLengths;
			vs.push(v);
		}
		p0= points[0];
		let v0= vs[0];
		for (let i=1; i<points.length; i++) {
			let v1= vs[i];
			let i0= nseg*(i-1);
			let i1= nseg*i;
			for (let j=0; j<nseg; j++) {
				let j1= (j+1)%nseg;
				this.addFace([i0+j,i1+j,i1+j1,i0+j1]);
				this.addSmoothFace(this.faces.length-1);
				let u0= j/nseg;
				let u1= (j+1)/nseg;
				this.addFaceUVs(this.faces.length-1,
				 [[u0,v0],[u0,v1],[u1,v1],[u1,v0]]);
			}
			v0= v1;
		}
	}
}

class Extrusion extends Mesh {
	constructor(ht,polygon) {
		super();
		let z= ht/2;
		let n= polygon.length;
		let face= [];
		for (let i=0; i<n; i++) {
			let xy= polygon[i];
			this.addVertex(xy[0],xy[1],z);
			face.push(i);
		}
		this.addFace(face);
		if (ht > 0) {
			z= -ht/2;
			face= [];
			for (let i=0; i<n; i++) {
				let xy= polygon[i];
				this.addVertex(xy[0],xy[1],z);
				face.push(i+n);
			}
			this.addFace(face.reverse());
			for (let i=0; i<n; i++) {
				let i1= (i+1)%n;
				this.addFace([i,i+n,i1+n,i1]);
			}
		}
	}
	addRectFaceUVs(index,u0,v0,du,dv) {
		this.addFaceUVs(index,
		  [[u0,v0+dv],[u0,v0],[u0+du,v0],[u0+du,v0+dv]]);
	}
}

class HipRoof extends Mesh {
	constructor(len,wid,ht) {
		super();
		let len2= len-wid;
		this.addVertex(-len/2,-wid/2,0);
		this.addVertex(len/2,-wid/2,0);
		this.addVertex(len/2,wid/2,0);
		this.addVertex(-len/2,wid/2,0);
		this.addVertex(-len2/2,0,ht);
		this.addVertex(len2/2,0,ht);
		this.addFace([0,1,5,4]);
		this.addFace([1,2,5]);
		this.addFace([2,3,4,5]);
		this.addFace([3,0,4]);
	}
}

// data for Blender object
class Object {
	constructor(meshName,texture) {
		this.mesh= meshName;
		this.texture= texture;
		this.lodbias= 0;
		this.lighting= "NORMAL";
		this.transparency= "OPAQUE";
	}
	setParent(name) {
		this.parent= name;
	}
	setPosition(x,y,z) {
		this.position= [x,y,z];
	}
	// set rotation about x, y and z axis in degrees.  xyz order
	setRotation(x,y,z) {
		this.rotation= [x,y,z];
	}
	addPositionAnimation(frame,x,y,z) {
		if (!this.animation)
			this.animation= [];
		if (!this.animation[frame])
			this.animation[frame]= {};
		this.animation[frame].position= [x,y,z];
	}
	addRotationAnimation(frame,x,y,z) {
		if (!this.animation)
			this.animation= [];
		if (!this.animation[frame])
			this.animation[frame]= {};
		this.animation[frame].rotation= [x,y,z];
	}
}

// data for MSTS/OR shape to be created by js2s.py
class Shape {
	constructor(filename) {
		this.filename= filename;
		this.meshMap= {};
		this.meshArray= [];
		this.objMap= {};
		this.objArray= [];
		this.lods= [];
	}
	addMesh(name,mesh) {
		if (this.meshMap[name]) {
			console.error("mesh "+name+" already exists");
			return null;
		}
		if (!mesh)
			mesh= new Mesh();
		mesh.name= name;
		this.meshMap[name]= mesh;
		this.meshArray.push(mesh);
		return mesh;
	}
	getMesh(name) {
		return this.meshMap.name;
	}
	addObject(name,meshName,texture) {
		if (this.objMap[name]) {
			console.error("object "+name+" already exists");
			return null;
		}
		let obj= new Object(meshName,texture);
		obj.name= name;
		this.objMap[name]= obj;
		this.objArray.push(obj);
		return obj;
	}
	getObject(name) {
		return this.objMap.name;
	}
	// adds level of detail information
	// objects should be an array of object names
	addLod(dist,objects) {
		if (objects) {
			this.lods.push({distance:dist,objects:objects});
		} else {
			let names= [];
			for (let i=0; i<this.objArray.length; i++)
				names.push(this.objArray[i].name);
			this.lods.push({distance:dist,objects:names});
		}
	}
	// convert shape to json like data
	getData(filename) {
		let data= {
			filename: this.filename,
			meshes: this.meshArray,
			objects: this.objArray,
			LODs: this.lods
		};
		return data;
	}
	// exports the shape to a json file
	exportJSON(filename) {
		let data= {
			filename: this.filename,
			meshes: this.meshArray,
			objects: this.objArray,
			LODs: this.lods
		};
		let s= JSON.stringify(data,null,1);
		if (filename.indexOf(".json") < 0)
			filename+= ".json";
		fs.writeFileSync(filename,s);
	}
}

exports.Shape= Shape;
exports.Mesh= Mesh;
exports.Box= Box;
exports.Cylinder= Cylinder;
exports.Extrusion= Extrusion;
exports.HipRoof= HipRoof;
exports.Turning= Turning;
