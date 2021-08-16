/*
Copyright © 2019 Doug Jones

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

//	3D rendering code

let renderer= null;
let camera= null;
let scene= null;
let cameraAngle= Math.PI/4;
let modelU= 1e10;
let modelV= 1e10;
let axis= null;
let tileModels= [];
let vOffset= .2;

//	draw the 3d scene in the 3d canvas
let render3D= function()
{
	if (!renderer) {
		initScene();
	}
//	if (scale>.4 && (trackChanged || Math.abs(modelU-centerU)>400 ||
//	  Math.abs(modelV-centerV)>400)) {
//		updateModels();
//		trackChanged= false;
//		modelU= centerU;
//		modelV= centerV;
//	}
	updateCamera();
	renderer.render(scene,camera);
}

//	initialize the 3d display
let initScene= function()
{
	scene= new THREE.Scene();
	axis= new THREE.AxisHelper(50);
	scene.add(axis);
	camera= new THREE.PerspectiveCamera(75,2,.2,3000);
	let canvas= document.getElementById("canvas3d");
	renderer= new THREE.WebGLRenderer({canvas: canvas});
	renderer.setClearColor(0x00dddd);
	renderer.sortObjects= false;
	var alight= new THREE.AmbientLight(0x888888);
	scene.add(alight);
	var dlight= new THREE.DirectionalLight(0xffffff,.5);
	dlight.position.set(0,100,50);
	scene.add(dlight);
	canvas.addEventListener("mousedown",mouseDown3D);
	canvas.addEventListener("mouseup",mouseUp3D);
	canvas.addEventListener("mousemove",mouseMove3D);
}

//	handle left arrow press to rotate camera left
let cameraLeft= function() {
	cameraAngle-= Math.PI/12;
	render3D();
}

//	handle right arrow press to rotate camera right
let cameraRight= function() {
	cameraAngle+= Math.PI/12;
	render3D();
}

//	create a terrain texture for a tile by drawing map background images
//	into a tile size canvas
let makeGroundTexture= function(tx,tz)
{
	let canvas= document.createElement("canvas");
	canvas.width= 256;
	canvas.height= 256;
	let cu= 2048*(tx-centerTX);
	let cv= 2048*(tz-centerTZ);
	let scale= 256/2048;
//	console.log("ground "+tx+" "+tz+" "+cu+" "+cv);
	let width= canvas.width;
	let height= canvas.height;
	let context= canvas.getContext("2d");
	context.fillStyle= "lightgreen";
	context.fillRect(0,0,canvas.width,canvas.height);
	for (let i=0; i<backgroundTiles.length; i++) {
		let bgt= backgroundTiles[i];
		if (!bgt.image)
			continue;
		let u= (bgt.u-cu)*scale + width/2;
		let v= height/2 - (bgt.v-cv)*scale;
		let w= bgt.image.width;
		let h= bgt.image.height;
		let su= scale*bgt.wid/w;
		let sv= scale*bgt.hgt/h;
		let skew= bgt.skew/bgt.wid*sv;
		context.setTransform(su,0,skew,sv,u,v);
		context.drawImage(bgt.image,0,0,w,h,-w/2,-h/2,w,h);
		context.setTransform(1,0,0,1,0,0);
//		console.log("bgt "+bgt.u+" "+bgt.v+" "+w+" "+h+" "+su+" "+sv);
	}
	return new THREE.CanvasTexture(canvas);
}

//	create a 3d model for the specified tiles terrain
let makeGroundModel= function(tx,tz)
{
	let tile= findTile(tx,tz);
	if (!tile) {
		console.log("no tile "+tx+" "+tz);
		return null;
	}
//	console.log("makegroundmodel "+tx+" "+tz);
	var texture= makeGroundTexture(tx,tz);
	var geom= new THREE.Geometry();
	let nv= 0;
	for (let i=0; i<256; i++) {
		for (let j=0; j<256; j++) {
			let a00= getTerrainElevation(i,j,tile);
			let a10= getTerrainElevation(i+1,j,tile);
			let a11= getTerrainElevation(i+1,j+1,tile);
			let a01= getTerrainElevation(i,j+1,tile);
			geom.vertices.push(
			  new THREE.Vector3(8*(j-128),a00,8*(i-128)),
			  new THREE.Vector3(8*(j-128),a10,8*(i+1-128)),
			  new THREE.Vector3(8*(j+1-128),a11,8*(i+1-128)),
			  new THREE.Vector3(8*(j+1-128),a01,8*(i-128))
			);
			geom.faces.push(
			  new THREE.Face3(nv+0,nv+1,nv+2),
			  new THREE.Face3(nv+2,nv+3,nv+0)
			);
//			geom.faceVertexUvs[0].push(
//			  [ new THREE.Vector2(0,0),
//			    new THREE.Vector2(0,1),
//			    new THREE.Vector2(1,1)
//			  ],
//			  [ new THREE.Vector2(1,1),
//			    new THREE.Vector2(1,0),
//			    new THREE.Vector2(0,0)
//			  ]
//			);
			geom.faceVertexUvs[0].push(
			  [ new THREE.Vector2(j/256,(256-i)/256),
			    new THREE.Vector2(j/256,(256-i-1)/256),
			    new THREE.Vector2((j+1)/256,(256-i-1)/256)
			  ],
			  [ new THREE.Vector2((j+1)/256,(256-i-1)/256),
			    new THREE.Vector2((j+1)/256,(256-i)/256),
			    new THREE.Vector2(j/256,(256-i)/256)
			  ]
			);
			nv+= 4;
		}
	}
//	console.log(" nv "+nv);
	geom.computeBoundingSphere();
	geom.computeFaceNormals();
	return new THREE.Mesh(geom,
	  new THREE.MeshLambertMaterial( { map: texture } ));
}

//	update the 3d camera angle and position to match the map display
//	center
let updateCamera= function()
{
	var dist= 200/scale;
	axis.position.x= centerU;
	axis.position.y= getElevation(centerU,centerV)+1.1;
	axis.position.z= -centerV;
	camera.position.x= axis.position.x-dist*Math.cos(cameraAngle);
	camera.position.y= axis.position.y+(dist<20?.2*dist:.5*dist);
	camera.position.z= axis.position.z+dist*Math.sin(cameraAngle);
	var lookat= new THREE.Vector3(axis.position.x,
	  axis.position.y,axis.position.z);
	camera.lookAt(lookat);
}

//	intersects a mouse event location with the 3d terrain models to
//	translate click into world coordinates
let getGroundHit= function(event)
{
	let canvas= document.getElementById("canvas3d");
	var cx= event.pageX - canvas.offsetLeft;
	var cy= event.pageY - canvas.offsetTop;
	var click= new THREE.Vector2(2*(cx/canvas.width)-1,
	  -2*(cy/canvas.height)+1);
	var raycaster= new THREE.Raycaster();
	raycaster.setFromCamera(click,camera);
	return raycaster.intersectObjects(tileModels);
}

//	handle mouse down event in 3d canvas
//	change display center on shift click
//	change selected control point and set up dragging
//	add control point on control click
let mouseDown3D= function(event)
{
	var intersects= getGroundHit(event);
	if (intersects.length == 0)
		return;
//	console.log("click3d "+intersects[0].point.x+" "+
//	  intersects[0].point.y+" "+intersects[0].point.z);
	if (event.shiftKey) {
		centerU= intersects[0].point.x;
		centerV= -intersects[0].point.z;
		console.log("elevation "+getElevation(centerU,centerV));
		renderCanvas();
	} else if (event.ctrlKey) {
		let cp= addControlPoint(intersects[0].point.x,
		  -intersects[0].point.z);
		if (cp) {
			selected= cp;
			selectedGroup= null;
			if (!cp.endNode)
				dragging= cp;
		}
		calcTrack();
		renderCanvas();
	} else {
		let bestD= 40;///(scale*scale);
		let bestPoint= null;
		let bestTrack= null;
		for (let j=0; j<tracks.length; j++) {
			let controlPoints= tracks[j].controlPoints;
			for (let i=0; i<controlPoints.length; i++) {
				let point= controlPoints[i];
				let dx= point.position.x-intersects[0].point.x;
				let dy= point.position.y+intersects[0].point.z;
				let d= dx*dx + dy*dy;
				if (d < bestD) {
					bestD= d;
					bestPoint= point;
					bestTrack= tracks[j];
				}
			}
		}
//		console.log("best "+bestD+" "+bestPoint);
		if (bestPoint && !bestPoint.endNode)
			dragging= bestPoint;
		else
			dragging= null;
		selected= bestPoint;
		selectedTrack= bestTrack;
		selectedGroup= null;
	}
	event.preventDefault();
}

//	handle mouse move event in 3d canvas
//	move selected control point
let mouseMove3D= function(event)
{
	if (dragging) {
		var intersects= getGroundHit(event);
		if (intersects.length > 0) {
			dragging.position.x= intersects[0].point.x;
			dragging.position.y= -intersects[0].point.z;
			constrainDrag();
			calcTrack();
			updateModels(false);
			renderCanvas();
		}
	}
}

//	handle mouse up event in 3d canvas
//	stop dragging
let mouseUp3D= function(event)
{
	dragging= null;
	renderCanvas();
}

//	update the 3d models based on the current display center
//	force refresh of terrain models if refresh is true
let updateModels= function(refresh)
{
//	console.log("update "+centerU+" "+centerV);
	let center= new THREE.Vector3(centerU,0,-centerV);
	for (let i=0; i<tileModels.length; i++) {
		let model= tileModels[i];
		let d= model.position.distanceTo(center);
		let dx= model.position.x-centerU;
		let dz= model.position.z+centerV;
		if (refresh || Math.abs(dx)>4000 || Math.abs(dz)>4000) {
			scene.remove(model);
			tileModels.splice(i,1);
			i--;
//			console.log("remove "+model.position.x+" "+
//			  model.position.z+" "+dx+" "+dz+" "+d);
		}
	}
	let tx= centerTX + Math.round(centerU/2048);
	let tz= centerTZ + Math.round(centerV/2048);
	for (let i=-1; i<2; i++) {
		for (j=-1; j<2; j++) {
			let x= 2048*((tx+i)-centerTX);
			let z= -2048*((tz+j)-centerTZ);
			let dx= x-centerU;
			let dz= z+centerV;
			if (Math.abs(dx)>2000 || Math.abs(dz)>2000)
				continue;
			let k=0;
			for (; k<tileModels.length; k++) {
				let model= tileModels[k];
				if (model.position.x==x && model.position.z==z)
					break;
			}
			if (k < tileModels.length)
				continue;
			let group= new THREE.Group();
			group.position.x= 2048*(tx+j-centerTX);
			group.position.y= 0;
			group.position.z= -2048*(tz+j-centerTZ);
			let ground= makeGroundModel(tx+i,tz+j);
			if (ground) {
				ground.position.x= 2048*(tx+i-centerTX);
				ground.position.y= 0;
				ground.position.z= -2048*(tz+j-centerTZ);
				group= ground;
//				group.add(ground);
			}
			if (addToTrackDB)
				addTrackModels(group,tx+i,tz+j);
			tileModels.push(group);
			scene.add(group);
//			console.log("tile models "+group.position.x+" "+
//			  group.position.z+" "+
//			  centerU+" "+centerV+" "+tx+" "+tz);
		}
	}
	updateDynTrackModels();
}

//	make geometry to represent a track section
let makeSectionGeometry= function(section)
{
	var geom= new THREE.Geometry();
	let addFaces= function(nv)
	{
		geom.faces.push(
		  new THREE.Face3(nv+0,nv+3,nv+1),
		  new THREE.Face3(nv+3,nv+4,nv+1),
		  new THREE.Face3(nv+1,nv+4,nv+2),
		  new THREE.Face3(nv+4,nv+5,nv+2)
		);
	}
	let addUVs= function(u1,u2)
	{
		geom.faceVertexUvs[0].push(
		  [ new THREE.Vector2(u1,1-16/512),
		    new THREE.Vector2(u2,1-16/512),
		    new THREE.Vector2(u1,1-162/512)
		  ],
		  [ new THREE.Vector2(u2,1-16/512),
		    new THREE.Vector2(u2,1-162/512),
		    new THREE.Vector2(u1,1-162/512)
		  ],
		  [ new THREE.Vector2(u1,1-162/512),
		    new THREE.Vector2(u2,1-162/512),
		    new THREE.Vector2(u1,1-308/512)
		  ],
		  [ new THREE.Vector2(u2,1-162/512),
		    new THREE.Vector2(u2,1-308/512),
		    new THREE.Vector2(u1,1-308/512)
		  ]
		);
	}
	geom.vertices.push(
	  new THREE.Vector3(-1.5,-.01,0),
	  new THREE.Vector3(0,0,0),
	  new THREE.Vector3(1.5,-.01,0)
	);
	if (section && section.angle>0) {
		let m= Math.ceil(section.angle/2);
//		console.log("turn right "+section.angle+" "+
//		  section.radius+" "+m);
		let nv= 0;
		let r= section.radius;
		let len= 2*r*Math.sin(section.angle/m/2*Math.PI/180);
		let nTies= Math.round(2*len);
		let du= nTies/12;
		let u= 0;
		for (let i=1; i<=m; i++) {
			let a= i/m*section.angle*Math.PI/180;
			let cs= Math.cos(a);
			let sn= Math.sin(a);
			geom.vertices.push(
			  new THREE.Vector3((r-1.5)*cs-r,-.01,(r-1.5)*sn),
			  new THREE.Vector3(r*cs-r,0,r*sn),
			  new THREE.Vector3((r+1.5)*cs-r,-.01,(r+1.5)*sn)
			);
			addFaces(nv);
			addUVs(u,u+du);
			u+= du;
			nv+= 3;
		}
	} else if (section && section.angle<0) {
		let m= Math.ceil(-section.angle/2);
//		console.log("turn left "+section.angle+" "+
//		  section.radius+" "+m);
		let nv= 0;
		let r= section.radius;
		let len= -2*r*Math.sin(section.angle/m/2*Math.PI/180);
		let nTies= Math.round(2*len);
		let du= nTies/12;
		let u= 0;
		for (let i=1; i<=m; i++) {
			let a= i/m*section.angle*Math.PI/180;
			let cs= Math.cos(a);
			let sn= -Math.sin(a);
			geom.vertices.push(
			  new THREE.Vector3(r-(r+1.5)*cs,-.01,(r+1.5)*sn),
			  new THREE.Vector3(r-r*cs,0,r*sn),
			  new THREE.Vector3(r-(r-1.5)*cs,-.01,(r-1.5)*sn)
			);
			addFaces(nv);
			addUVs(u,u+du);
			u+= du;
			nv+= 3;
		}
	} else if (section && section.length) {
		let len= section.length;
//		console.log("straight "+len);
		geom.vertices.push(
		  new THREE.Vector3(-1.5,-.01,len),
		  new THREE.Vector3(0,0,len),
		  new THREE.Vector3(1.5,-.01,len)
		);
		addFaces(0);
		let nTies= Math.round(2*len);
		let u= nTies/12;
		addUVs(0,u);
	}
	geom.computeBoundingSphere();
	geom.computeFaceNormals();
	return geom;
}

let trackMaterial= null;
let sectionGeometry= [];

//	create a model for a track section
let makeSectionMesh= function(id)
{
	if (!trackMaterial) {
		var img= document.getElementById("trackimage");
		var texture= new THREE.Texture(img);
		texture.wrapS= THREE.RepeatWrapping;
		texture.wrapT= THREE.RepeatWrapping;
		texture.needsUpdate= true;
		trackMaterial=
		   new THREE.MeshLambertMaterial( { map: texture } );
	}
	if (!sectionGeometry[id]) {
		let section= trackDB.tSection.sections[id];
//		console.log("make section "+id+" "+section);
		sectionGeometry[id]= makeSectionGeometry(section);
	}
	return new THREE.Mesh(sectionGeometry[id],trackMaterial);
}

//	create 3d models for track in tdb file
let addTrackModels= function(group,tx,tz)
{
	for (let i=0; trackDB && i<trackDB.nodes.length; i++) {
		let node= trackDB.nodes[i];
		if (node && node.sections) {
			for (let j=0; j<node.sections.length; j++) {
				let section= node.sections[j];
				if (section.tx==tx && section.tz==tz) {
					model=
					  makeSectionMesh(section.sectionID);
					model.position.x= section.x;
					model.position.y= section.y+vOffset;
					model.position.z= -section.z;
					model.rotation.set(section.ax,
					  Math.PI-section.ay,section.az,"YXZ");
					group.add(model);
				}
			}
		}
	}
}

//	create a 3d model for a dynamic track curve
let makeCurveModel= function(curve)
{
	if (!trackMaterial) {
		var img= document.getElementById("trackimage");
		var texture= new THREE.Texture(img);
		texture.wrapS= THREE.RepeatWrapping;
		texture.wrapT= THREE.RepeatWrapping;
		texture.needsUpdate= true;
		trackMaterial=
		   new THREE.MeshLambertMaterial( { map: texture } );
	}
	let group= new THREE.Group();
	let angle= 0;
	let offset= new THREE.Vector3();
	if (curve.len1 > .1) {
		let geom= makeSectionGeometry({length: curve.len1});
		let model= new THREE.Mesh(geom,trackMaterial);
		group.add(model);
		offset.z+= curve.len1;
	}
	if (curve.radius > 10) {
		let geom= makeSectionGeometry({
		  radius: curve.radius, angle: -curve.angle*180/Math.PI
		});
		let model= new THREE.Mesh(geom,trackMaterial);
		model.position.copy(offset);
		group.add(model);
		if (curve.angle < 0)
			offset.x-= curve.radius*(1-Math.cos(curve.angle));
		else
			offset.x+= curve.radius*(1-Math.cos(curve.angle));
		offset.z+= Math.abs(curve.radius*Math.sin(curve.angle));
		angle+= curve.angle;
	}
	if (curve.len2 > .1) {
		let geom= makeSectionGeometry({length: curve.len2});
		let model= new THREE.Mesh(geom,trackMaterial);
		model.position.copy(offset);
		model.rotation.y= angle;
		group.add(model);
	}
	return group;
}

let dynTrackModels= null;

//	updates the 3d models for the dynamic track
let updateDynTrackModels= function()
{
	if (dynTrackModels)
		scene.remove(dynTrackModels);
	dynTrackModels= new THREE.Group();
	for (let j=0; j<tracks.length; j++) {
		let track= tracks[j];
		let dynTrackPoints= track.dynTrackPoints;
		let controlPoints= track.controlPoints;
		if (dynTrackPoints.length < 2)
			continue;
		for (let i=0; i<dynTrackPoints.length-1; i++) {
			let point= dynTrackPoints[i];
			let model= makeCurveModel(point.curve);
			let angle= Math.atan2(point.direction.y,
			  point.direction.x);
			model.position.x= point.position.x;
			model.position.y= point.elevation+vOffset;
			model.position.z= -point.position.y;
			model.rotateY(angle+Math.PI/2);
			model.rotateX(-point.curve.elevation);
			dynTrackModels.add(model);
		}
		if (controlPoints.length > 0)
			dynTrackModels.add(makeCPLineGeometry(track));
//		dynTrackModels.add(makeLineGeometry(track));
	}
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		let point= sw.points[0];
		let shape= trackDB.tSection.shapes[sw.shapeID];
		if (!shape)
			continue;
		let group= new THREE.Group();
		for (let j=0; j<shape.paths.length; j++) {
			let path= shape.paths[j];
			let offset= new THREE.Vector3();
			let dir= new THREE.Vector3(0,0,1);
			let angle= 0;
			for (let k=0; k<path.sections.length; k++) {
				let section= path.sections[k];
				let model= makeSectionMesh(section);
				model.position.copy(offset);
				model.rotateY(angle);
				group.add(model);
				let sec= trackDB.tSection.sections[section];
				if (sec.length>0) {
					offset.x+= dir.x*sec.length;
					offset.z+= dir.z*sec.length;
				} else {
					let a= sec.angle*Math.PI/180;
					let t= sec.radius*Math.tan(
					  Math.abs(a/2));
					offset.x+= t*dir.x;
					offset.z+= t*dir.z;
					let cos= Math.cos(a);
					let sin= Math.sin(-a);
					let dx= dir.x;
					let dz= dir.z;
					dir.z= cos*dz - sin*dx;
					dir.x= cos*dx + sin*dz;
					offset.x+= t*dir.x;
					offset.z+= t*dir.z;
					angle-= a;
				}
			}
		}
		let angle= Math.atan2(point.direction.y,
		  point.direction.x);
		if (point.forcedDirection == 1)
			angle+= Math.PI;
		group.position.x= point.position.x;
		group.position.y= point.position.z+vOffset;
		group.position.z= -point.position.y;
		group.rotateY(angle+Math.PI/2);
		group.rotateX(-sw.grade);
		dynTrackModels.add(group);
	}
	scene.add(dynTrackModels);
}

//	creates 3d models for dynamic track center lines
let makeLineGeometry= function(track)
{
	let lineGeom= new THREE.Geometry();
	let dynTrackPoints= track.controlPoints;
	for (let i=0; i<dynTrackPoints.length; i++) {
		let point= dynTrackPoints[i];
		lineGeom.vertices.push(
		  new THREE.Vector3(point.position.x,
		  point.elevation+vOffset,-point.position.y));
	}
	let lineMat= new THREE.LineBasicMaterial({ color: 0x0000ff });
	return new THREE.Line(lineGeom,lineMat);
}

//	creates 3d models for dynamic track control points (vertical lines)
let makeCPLineGeometry= function(track)
{
	let lineGeom= new THREE.Geometry();
	let controlPoints= track.controlPoints;
	for (let i=0; i<controlPoints.length; i++) {
		let point= controlPoints[i];
		lineGeom.vertices.push(
		  new THREE.Vector3(point.position.x,
		  point.position.z+vOffset,-point.position.y));
		lineGeom.vertices.push(
		  new THREE.Vector3(point.position.x,
		  point.position.z+vOffset+10,-point.position.y));
		if (point==selected && point.direction) {
			lineGeom.vertices.push(new THREE.Vector3(
			  point.position.x,
			  point.position.z+vOffset+10,
			  -point.position.y));
			lineGeom.vertices.push(new THREE.Vector3(
			  point.position.x+5*point.direction.x,
			  point.position.z+vOffset+10,
			  -point.position.y-5*point.direction.y));
		}
	}
	let lineMat= new THREE.LineBasicMaterial({ color: 0x0000ff });
	return new THREE.LineSegments(lineGeom,lineMat);
}
