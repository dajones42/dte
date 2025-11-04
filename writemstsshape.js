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

//	Exports shape json to MSTS shape file.
//	usage: writeMstsShape(json)

const fs= require('fs');
require('./csg.js');

let writeVolumes= function(fd,input)
{
	fs.writeSync(fd," volumes ( 1\r\n",null,"utf16le");
	fs.writeSync(fd,"  vol_sphere (\r\n",null,"utf16le");
	fs.writeSync(fd,"   vector ( 0 0 0 ) 100\r\n",null,"utf16le");
	fs.writeSync(fd,"  )\r\n",null,"utf16le");
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeShaderNames= function(fd,input)
{
	fs.writeSync(fd," shader_names ( 2\r\n",null,"utf16le");
	fs.writeSync(fd,"  named_shader ( TexDiff )\r\n",null,"utf16le");
	fs.writeSync(fd,"  named_shader ( BlendATexDiff )\r\n",null,"utf16le");
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeTextureFilterNames= function(fd,input)
{
	fs.writeSync(fd," texture_filter_names ( 1\r\n",null,"utf16le");
	fs.writeSync(fd,"  named_filter_mode ( MipLinear )\r\n",null,"utf16le");
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writePoints= function(fd,input)
{
	let n= 0;
	for (let i=0; i<input.meshes.length; i++) {
		let mesh= input.meshes[i];
		mesh.points= [];
		for (let j=0; j<mesh.coords.length; j++)
			mesh.points.push(n++);
	}
	fs.writeSync(fd," points ( "+n.toFixed(0)+"\r\n",null,"utf16le");
	for (let i=0; i<input.meshes.length; i++) {
		let mesh= input.meshes[i];
		for (let j=0; j<mesh.coords.length; j++) {
			let xyz= mesh.coords[j];
			fs.writeSync(fd,"  point ( "+xyz[0].toFixed(3)+" "+
			  xyz[2].toFixed(3)+" "+xyz[1].toFixed(3)+
			  " )\r\n",null,"utf16le");
		}
	}
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeUVPoints= function(fd,input)
{
	let uvPoints= [];
	let addUV= function(uv) {
		for (let i=0; i<uvPoints.length; i++) {
			if (uv[0]==uvPoints[i][0] && uv[1]==uvPoints[i][1])
				return i;
		}
		uvPoints.push(uv);
		return uvPoints.length-1;
	}
	for (let i=0; i<input.meshes.length; i++) {
		let mesh= input.meshes[i];
		mesh.uvPoints= [];
		if (mesh.vertexUVs) {
			for (let j=0; j<mesh.vertexUVs.length; j++)
				mesh.uvPoints.push(addUV(mesh.vertexUVs[j]));
		}
		if (mesh.faceUVs) {
			for (let j=0; j<mesh.faceUVs.length; j++) {
				let fuvs= mesh.faceUVs[j];
				for (let k=0; k<fuvs.length; k++)
					mesh.uvPoints.push(addUV(fuvs[k]));
			}
		}
	}
	fs.writeSync(fd," uv_points ( "+uvPoints.length+"\r\n",null,"utf16le");
	for (let i=0; i<uvPoints.length; i++) {
		let uv= uvPoints[i];
		fs.writeSync(fd,"  uv_point ( "+
		  uv[0].toFixed(4)+" "+(1-uv[1]).toFixed(4)+
		  " )\r\n",null,"utf16le");
	}
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeNormals= function(fd,input)
{
	let normals= [];
	let addNormal= function(n) {
		if (isNaN(n.x) || isNaN(n.y) || isNaN(n.z))
			return 0;
		for (let i=0; i<normals.length; i++)
			if (normals[i].x==n.x && normals[i].y==n.y &&
			  normals[i].z==n.z)
				return i;
		normals.push(n);
		return normals.length-1;
	}
	let n= 0;
	for (let i=0; i<input.meshes.length; i++) {
		let mesh= input.meshes[i];
		mesh.normals= [];
		for (let j=0; j<mesh.faces.length; j++) {
			let face= mesh.faces[j];
			let a= new CSG.Vector(mesh.coords[face[0]]);
			let b= new CSG.Vector(mesh.coords[face[1]]);
			let c= new CSG.Vector(mesh.coords[face[2]]);
			let normal= b.minus(a).cross(c.minus(a)).unit();
			mesh.normals.push(addNormal(normal));
		}
		if (mesh.smoothFaces) {
			let sfaces= mesh.smoothFaces;
			mesh.vertNormals= [];
			for (let j=0; j<mesh.coords.length; j++)
				mesh.vertNormals.push(new CSG.Vector(0,0,0));
			for (let j=0; j<sfaces.length; j++) {
				let face= mesh.faces[sfaces[j]];
				let normal= normals[mesh.normals[sfaces[j]]];
				for (let k=0; k<face.length; k++) {
					let vi= face[k];
					mesh.vertNormals[vi]=
					  mesh.vertNormals[vi].plus(normal);
				}
			}
			for (let j=0; j<mesh.vertNormals.length; j++)
				mesh.vertNormals[j]=
				  addNormal(mesh.vertNormals[j].unit());
		}
	}
	fs.writeSync(fd," normals ( "+normals.length+"\r\n",null,"utf16le");
	for (let i=0; i<normals.length; i++) {
		let normal= normals[i];
		fs.writeSync(fd,"  vector ( "+normal.x.toFixed(3)+" "+
		  normal.z.toFixed(3)+" "+normal.y.toFixed(3)+
		  " )\r\n",null,"utf16le");
	}
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeSortVectors= function(fd,input)
{
	fs.writeSync(fd," sort_vectors ( 1\r\n",null,"utf16le");
	fs.writeSync(fd,"  vector ( 0 0 0 )\r\n",null,"utf16le");
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeColours= function(fd,input)
{
	fs.writeSync(fd," colours ( 0\r\n",null,"utf16le");
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeMatrices= function(fd,input)
{
	for (let i=0; i<input.objects.length; i++) {
		let o= input.objects[i];
		o.children= [];
		o.matrix= 0;
	}
	let root= null;
	for (let i=0; i<input.objects.length; i++) {
		let o= input.objects[i];
		if (o.parent) {
			let p= input.objectMap[o.parent];
			if (p)
				p.children.push(o);
			else
				console.error("cannot find parent "+
				  o.parent+" "+o.name);
		} else if (!root || root.position) {
			root= o;
		}
	}
	if (!root)
		console.error("cannot find root object");
	for (let i=0; i<input.objects.length; i++) {
		let o= input.objects[i];
		if (o!=root && !o.parent)
			root.children.push(o);
	}
	fs.writeSync(fd," matrices ( "+input.objects.length+"\r\n",
	  null,"utf16le");
	input.hierarchy= [ ];
	let printMatrix= function(obj,parent) {
		obj.matrix= input.hierarchy.length;
		input.hierarchy.push(parent);
		fs.writeSync(fd,
		  "  matrix "+obj.name+" ( 1 0 0  0 1 0  0 0 1 ",
		  null,"utf16le");
		if (obj.position)
			fs.writeSync(fd," "+obj.position[0]+" "+
			  obj.position[2]+" "+obj.position[1]+" )\r\n",
			  null,"utf16le");
		else
			fs.writeSync(fd," 0 0 0 )\r\n",null,"utf16le");
		for (let i=0; i<obj.children.length; i++) {
			printMatrix(obj.children[i],obj.matrix);
		}
	}
	printMatrix(root,-1);
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeImages= function(fd,input)
{
	let images= [];
	let addImage= function(image) {
		for (let i=0; i<images.length; i++)
			if (image==images[i])
				return i;
		images.push(image);
		return images.length-1;
	}
	for (let i=0; i<input.objects.length; i++) {
		let o= input.objects[i];
		o.imageIndex= addImage(o.texture);
	}
	fs.writeSync(fd," images ( "+images.length+"\r\n",
	  null,"utf16le");
	for (let i=0; i<images.length; i++)
		fs.writeSync(fd,"  image ( "+images[i]+" ) \r\n",
		  null,"utf16le");
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeTextures= function(fd,input)
{
	fs.writeSync(fd," textures ( "+input.objects.length+" \r\n",
	  null,"utf16le");
	for (let i=0; i<input.objects.length; i++) {
		let o= input.objects[i];
		fs.writeSync(fd,"  texture ( "+o.imageIndex+" 0 "+
		  o.lodbias.toFixed(1)+" ff000000 )\r\n",null,"utf16le");
	}
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeLightMaterials= function(fd,input)
{
	fs.writeSync(fd," light_materials ( 0\r\n",null,"utf16le");
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeLightModelConfigs= function(fd,input)
{
	fs.writeSync(fd," light_model_cfgs ( 1\r\n",null,"utf16le");
	fs.writeSync(fd,"  light_model_cfg ( 00000000\r\n",null,"utf16le");
	fs.writeSync(fd,"   uv_ops ( 1\r\n",null,"utf16le");
	fs.writeSync(fd,"    uv_op_copy ( 1 0 )\r\n",null,"utf16le");
	fs.writeSync(fd,"   )\r\n",null,"utf16le");
	fs.writeSync(fd,"  )\r\n",null,"utf16le");
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeVertexStates= function(fd,input)
{
	let lmiMap= { "NORMAL": -5, "SPECULAR25": -6, "SPECULAR750": -7,
	  "FULLBRIGHT": -8, "CRUCIFORM": -9, "HALFBRIGHT": -11, "DARK": -12 };
	fs.writeSync(fd," vtx_states ( "+input.objects.length+" \r\n",
	  null,"utf16le");
	for (let i=0; i<input.objects.length; i++) {
		let o= input.objects[i];
		let lmi= lmiMap[o.lighting] || -5;
		fs.writeSync(fd,"  vtx_state ( 00000000 "+o.matrix+" "+lmi+
		  " 0 00000002 )\r\n",null,"utf16le");
		o.vtxState= i;
	}
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writePrimStates= function(fd,input)
{
	fs.writeSync(fd," prim_states ( "+input.objects.length+" \r\n",
	  null,"utf16le");
	for (let i=0; i<input.objects.length; i++) {
		let o= input.objects[i];
		let shader= 1;
		let alphaTest= 0;
		if (o.transparency == "CLIP")
			alphaTest= 1;
		else if (o.transparency == "OPAQUE")
			shader= 0;
		fs.writeSync(fd,"  prim_state "+o.name+" ( 00000000 "+shader+
		  "\r\n",null,"utf16le");
		fs.writeSync(fd,"   tex_idxs ( 1 "+i+" ) 0 "+i+" "+alphaTest+
		  " 0 1\r\n",null,"utf16le");
		o.primState= i;
		fs.writeSync(fd,"  )\r\n",null,"utf16le");
	}
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeSubObject= function(fd,input,name)
{
	let o= input.objectMap[name];
	if (!o) {
		console.error("cannot find object "+name);
		return;
	}
	let m= input.meshMap[o.mesh];
	if (!m) {
		console.error("cannot find mesh "+o.mesh);
		return;
	}
	let nvert= 0;
	let ntri= 0;
	for (let i=0; i<m.faces.length; i++) {
		let face= m.faces[i];
		nvert+= face.length;
		ntri+= face.length-2;
	}
	fs.writeSync(fd,"      sub_object ( \r\n",null,"utf16le");
	fs.writeSync(fd,"       sub_object_header ( 00000400 -1 -1 000001d2 "+
	  "000001c4\r\n",null,"utf16le");
	fs.writeSync(fd,"        geometry_info ( "+ntri+" 1 0 "+(3*ntri)+
	  " 0 0 1 0 0 0\r\n",null,"utf16le");
	fs.writeSync(fd,"         geometry_nodes ( 1\r\n",null,"utf16le");
	fs.writeSync(fd,"          geometry_node ( 1 0 0 0 0\r\n",
	  null,"utf16le");
	fs.writeSync(fd,"           cullable_prims ( 1 "+ntri+" "+(3*ntri)+
	  " )\r\n",null,"utf16le");
	fs.writeSync(fd,"          )\r\n",null,"utf16le");
	fs.writeSync(fd,"         )\r\n",null,"utf16le");
	fs.writeSync(fd,"         geometry_node_map ( 1 0 )\r\n",
	  null,"utf16le");
	fs.writeSync(fd,"        )\r\n",null,"utf16le");
	fs.writeSync(fd,"        subobject_shaders ( 1 0 )\r\n",null,"utf16le");
	fs.writeSync(fd,"        subobject_light_cfgs ( 1 0 ) 0\r\n",
	  null,"utf16le");
	fs.writeSync(fd,"       )\r\n",null,"utf16le");
	fs.writeSync(fd,"       vertices ( "+nvert+"\r\n",
	  null,"utf16le");
	let vi= 0;
	for (let i=0; i<m.faces.length; i++) {
		let face= m.faces[i];
		let useVN= m.smoothFaces && m.smoothFaces.indexOf(i)>=0;
		for (let j=0; j<face.length; j++) {
			let normal= useVN ? m.vertNormals[face[j]] :
			  m.normals[i];
			fs.writeSync(fd,"        vertex ( 00000000 "+
			  m.points[face[j]]+" "+normal+
			  " FFFFFFFF FF000000\r\n",null,"utf16le");
			let uv= m.uvPoints[face[j]];
			if (m.faceUVs)
				uv= m.uvPoints[vi++];
			fs.writeSync(fd,"         vertex_uvs ( 1 "+uv+
			  " )\r\n",null,"utf16le");
			fs.writeSync(fd,"        )\r\n",null,"utf16le");
		}
	}
	fs.writeSync(fd,"       )\r\n",null,"utf16le");
	fs.writeSync(fd,"       vertex_sets ( 1\r\n",
	  null,"utf16le");
	fs.writeSync(fd,"        vertex_set ( "+o.vtxState+" 0 "+nvert+" )\r\n",
	  null,"utf16le");
	fs.writeSync(fd,"       )\r\n",null,"utf16le");
	fs.writeSync(fd,"       primitives ( 2\r\n",
	  null,"utf16le");
	fs.writeSync(fd,"        prim_state_idx ( "+o.primState+" )\r\n",
	  null,"utf16le");
	fs.writeSync(fd,"        indexed_trilist (\r\n",
	  null,"utf16le");
	fs.writeSync(fd,"         vertex_idxs ( "+(3*ntri),
	  null,"utf16le");
	vi= 0;
	let n= 0;
	for (let i=0; i<m.faces.length; i++) {
		let face= m.faces[i];
		for (let j=0; j<face.length-2; j++) {
			if (n>0 && n%6==0)
				fs.writeSync(fd,"\r\n         ",null,"utf16le");
			n++;
			fs.writeSync(fd," "+vi+" "+(vi+j+2)+" "+(vi+j+1),
			  null,"utf16le");
		}
		vi+= face.length;
	}
	fs.writeSync(fd," )\r\n",null,"utf16le");
	fs.writeSync(fd,"         normal_idxs ( "+ntri,
	  null,"utf16le");
	n= 0;
	for (let i=0; i<m.faces.length; i++) {
		let face= m.faces[i];
		for (let j=0; j<face.length-2; j++) {
			if (n>0 && n%10==0)
				fs.writeSync(fd,"\r\n         ",null,"utf16le");
			n++;
			fs.writeSync(fd," "+m.normals[i]+" 3",
			  null,"utf16le");
		}
	}
	fs.writeSync(fd," )\r\n",null,"utf16le");
	fs.writeSync(fd,"         flags ( "+ntri,
	  null,"utf16le");
	n= 0;
	for (let i=0; i<m.faces.length; i++) {
		let face= m.faces[i];
		for (let j=0; j<face.length-2; j++) {
			if (n>0 && n%6==0)
				fs.writeSync(fd,"\r\n         ",null,"utf16le");
			n++;
			fs.writeSync(fd," 00000000",null,"utf16le");
		}
	}
	fs.writeSync(fd," )\r\n",null,"utf16le");
	fs.writeSync(fd,"        )\r\n",null,"utf16le");
	fs.writeSync(fd,"       )\r\n",null,"utf16le");
	fs.writeSync(fd,"      )\r\n",null,"utf16le");
}

let writeLODControls= function(fd,input)
{
	fs.writeSync(fd," lod_controls ( 1\r\n",null,"utf16le");
	fs.writeSync(fd,"  lod_control (\r\n",null,"utf16le");
	fs.writeSync(fd,"   distance_levels_header ( 0 )\r\n",null,"utf16le");
	fs.writeSync(fd,"   distance_levels ( "+input.LODs.length+"\r\n",
	  null,"utf16le");
	for (let i=0; i<input.LODs.length; i++) {
		lod= input.LODs[i];
		fs.writeSync(fd,"    distance_level (\r\n",null,"utf16le");
		fs.writeSync(fd,"     distance_level_header (\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"      dlevel_selection ( "+
		  lod.distance.toFixed(0)+" )\r\n",null,"utf16le");
		fs.writeSync(fd,"      hierarchy ( "+input.hierarchy.length,
		  null,"utf16le");
		for (let j=0; j<input.hierarchy.length; j++)
			fs.writeSync(fd," "+input.hierarchy[j],null,"utf16le");
		fs.writeSync(fd," )\r\n",null,"utf16le");
		fs.writeSync(fd,"     )\r\n",null,"utf16le");
		fs.writeSync(fd,"     sub_objects ( "+lod.objects.length+"\r\n",
		  null,"utf16le");
		for (let j=0; j<lod.objects.length; j++)
			writeSubObject(fd,input,lod.objects[j]);
		fs.writeSync(fd,"     )\r\n",null,"utf16le");
		fs.writeSync(fd,"    )\r\n",null,"utf16le");
	}
	fs.writeSync(fd,"   )\r\n",null,"utf16le");
	fs.writeSync(fd,"  )\r\n",null,"utf16le");
	fs.writeSync(fd," )\r\n",null,"utf16le");
}

let writeAnimations= function(fd,input)
{
}

let writeShapeNameData= function(fd,input)
{
}

let writeMstsShape= function(input)
{
	input.objectMap= {};
	input.meshMap= {};
	for (let i=0; i<input.objects.length; i++) {
		let o= input.objects[i];
		input.objectMap[o.name]= o;
	}
	for (let i=0; i<input.meshes.length; i++) {
		let m= input.meshes[i];
		input.meshMap[m.name]= m;
	}
	const fd= fs.openSync(input.filename,"w");
	const bom= Buffer.alloc(2);
	bom.writeUInt16LE(0xfeff,0);
	fs.writeSync(fd,bom,0,2);
	fs.writeSync(fd,"SIMISA@@@@@@@@@@JINX0s1t______\r\n",null,"utf16le");
	fs.writeSync(fd,"\r\n",null,"utf16le");
	fs.writeSync(fd,"shape (\r\n",null,"utf16le");
	fs.writeSync(fd," shape_header ( 00000000 00000000 )\r\n",
	  null,"utf16le");
	writeVolumes(fd,input);
	writeShaderNames(fd,input);
	writeTextureFilterNames(fd,input);
	writePoints(fd,input);
	writeUVPoints(fd,input);
	writeNormals(fd,input);
	writeSortVectors(fd,input);
	writeColours(fd,input);
	writeMatrices(fd,input);
	writeImages(fd,input);
	writeTextures(fd,input);
	writeLightMaterials(fd,input);
	writeLightModelConfigs(fd,input);
	writeVertexStates(fd,input);
	writePrimStates(fd,input);
	writeLODControls(fd,input);
	writeAnimations(fd,input);
	writeShapeNameData(fd,input);
	fs.writeSync(fd,")\r\n",null,"utf16le");
	fs.closeSync(fd);
}

exports.writeMstsShape= writeMstsShape;
