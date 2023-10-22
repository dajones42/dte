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

//	map drawing related code

let centerU= 0;
let centerV= 0;
let backgroundTiles= [];
let draggingDir= false;
let draggingSize= false;
let overlay= null;
let moveMode= false;

//	initialize 2d map display
let setupMap= function()
{
	let canvas= document.getElementById('canvas');
	canvas.addEventListener('mousedown',mapMouseDown);
	canvas.addEventListener('mousemove',mapMouseMove);
	canvas.addEventListener('mouseup',mapMouseUp);
	THREE.Cache.enabled= true;
}

//	draw display in map canvas
let renderMap= function()
{
	if (scale > .1)
		updateBackgroundTiles();
	let canvas= document.getElementById("canvas");
	let width= canvas.width;
	let height= canvas.height;
	let context= canvas.getContext("2d");
	context.clearRect(0,0,canvas.width,canvas.height);
	context.fillStyle= "black";
	context.textAlign= "center";
	for (let i=0; i<tiles.length; i++) {
		let tile= tiles[i];
		let u= (2048*(tile.x-centerTX)-centerU)*scale + width/2;
		let v= height/2 - (2048*(tile.z-centerTZ)-centerV)*scale;
		context.fillText(tile.filename+" "+tile.x+" "+tile.z,u,v);
	}
	let paint= true;
	for (let i=0; i<backgroundTiles.length; i++) {
		let bgt= backgroundTiles[i];
		if (!bgt.image || !bgt.image.complete)
			continue;
		if (bgt.zoom==20 && paint) {
			paintBackground(context,scale,width,height,
			  centerU,centerV);
			paint= false;
		}
		let u= (bgt.u-centerU)*scale + width/2;
		let v= height/2 - (bgt.v-centerV)*scale;
		let x0= 0;
		let y0= 0;
		let w= bgt.image.width;
		let h= bgt.image.height;
		if (bgt.map) {
			let map= bgt.map;
			x0= map.x0;
			y0= map.y0;
			w= map.width;
			h= map.height;
			let su= map.cos*scale*bgt.wid/w;
			let sv= map.cos*scale*bgt.hgt/h;
			context.setTransform(su,map.sin,-map.sin,sv,u,v);
		} else {
			let su= scale*bgt.wid/w;
			let sv= scale*bgt.hgt/h;
			let skew= bgt.skew/bgt.wid*sv;
			let skewv= -bgt.skewv/bgt.hgt*sv;
			context.setTransform(su,skewv,skew,sv,u,v);
		}
		let img= bgt.image;
//		if (bgt.zoom == 20)
//			img= fixHydroImage(img);
		context.drawImage(img,x0,y0,w,h,-w/2,-h/2,w,h);
		if (bgt.saved) {
			context.strokeWidth= 1;
			context.strokeStyle= "fuchsia";//"lightblue";
			context.beginPath();
			context.moveTo(-128,-128);
			context.lineTo(128,128);
			context.lineTo(128,-128);
			context.lineTo(-128,128);
			context.stroke();
		}
		context.setTransform(1,0,0,1,0,0);
	}
	if (overlay) {
		context.globalAlpha= .5;
		let map= overlay;
		let u= (map.u-centerU)*scale + width/2;
		let v= height/2 - (map.v-centerV)*scale;
		let x0= map.x0;
		let y0= map.y0;
		let w= map.width;
		let h= map.height;
		let su= map.cos*scale*map.wid/w;
		let sv= map.cos*scale*map.hgt/h;
		context.setTransform(su,map.sin,-map.sin,sv,u,v);
		context.drawImage(map.image,x0,y0,w,h,-w/2,-h/2,w,h);
		context.setTransform(1,0,0,1,0,0);
		context.globalAlpha= 1;
	}
	if (paint) {
		paintBackground(context,scale,width,height,centerU,centerV);
		paint= false;
	}
	context.strokeWidth= 1;
	context.strokeStyle= "fuchsia";//"lightblue";
	for (let i=0; i<tiles.length; i++) {
		let tile= tiles[i];
		for (let j=0; tile.patchModels && j<tile.patchModels.length;
		  j++) {
			let tpm= tile.patchModels[j];
			let u= (2048*(tile.x-centerTX)-1024-centerU+
			  128*tpm[1])*scale + width/2;
			let v= height/2 - (2048*(tile.z-centerTZ)+1024-centerV-
			  128*tpm[0])*scale;
			context.strokeRect(u,v,128*scale,128*scale);
		}
	}
	context.strokeStyle= "orange";
	for (let i=0; i<tiles.length; i++) {
		let tile= tiles[i];
		for (let j=0; tile.noCut && j<tile.noCut.length; j++) {
			let tnc= tile.noCut[j];
			if (tnc.value) {
				let u= (2048*(tile.x-centerTX)-1024-centerU+
				  128*tnc.j)*scale + width/2;
				let v= height/2 -
				  (2048*(tile.z-centerTZ)+1024-centerV-
				  128*tnc.i)*scale;
				context.strokeRect(u,v,128*scale,128*scale);
			}
		}
	}
	context.strokeStyle= "fuchsia";//"lightblue";
	for (let i=0; i<tiles.length; i++) {
		let tile= tiles[i];
		let u= (2048*(tile.x-centerTX)-1024-centerU)*scale + width/2;
		let v= height/2 - (2048*(tile.z-centerTZ)+1024-centerV)*scale;
		context.strokeRect(u,v,2048*scale,2048*scale);
	}
	if (selected && selectedTrack.type=="contour") {
		let x= 8*Math.ceil(selected.position.x/8);
		let y= 8*Math.ceil(selected.position.y/8);
		let sz= 5;
		context.beginPath();
		for (let i=-sz; i<=sz; i++) {
			let u= (x-8*sz-centerU)*scale + width/2;
			let v= height/2 - (y+8*i-centerV)*scale;
			context.moveTo(u,v);
			u= (x+8*sz-centerU)*scale + width/2;
			context.lineTo(u,v);
			u= (x-8*i-centerU)*scale + width/2;
			v= height/2 - (y-8*sz-centerV)*scale;
			context.moveTo(u,v);
			v= height/2 - (y+8*sz-centerV)*scale;
			context.lineTo(u,v);
		}
		context.stroke();
	}
	context.strokeWidth= 1;
	context.strokeStyle= "red";
	context.beginPath();
	context.moveTo(width/2,height/2);
	context.lineTo(width/2+5,height/2);
	context.stroke();
	context.strokeStyle= "blue";
	context.beginPath();
	context.moveTo(width/2,height/2);
	context.lineTo(width/2,height/2+5);
	context.stroke();
	context.strokeStyle= "black";
	let drawSection= function(id,u1,v1,u2,v2) {
		let section= trackDB.tSection.sections[id];
		if (!section || section.length) {
			context.lineTo(u2,v2);
			return;
		}
		let du= u2 - u1;
		let dv= v2 - v1;
		let d= Math.sqrt(du*du+dv*dv);
		du/= d;
		dv/= d;
		let r= section.radius*scale;
		let a= .5*section.angle*Math.PI/180;
		let t= r*Math.abs(Math.tan(a));
		let x= Math.sqrt(t*t+r*r) - r*Math.cos(a);
		let ui= .5*(u1+u2);
		let vi= .5*(v1+v2);
		if (section.angle>0) {
			ui+= x*dv;
			vi-= x*du;
		} else {
			ui-= x*dv;
			vi+= x*du;
		}
		context.arcTo(ui,vi,u2,v2,r);
	}
	for (let i=0; addToTrackDB && trackDB && i<trackDB.nodes.length; i++) {
		let node= trackDB.nodes[i];
		if (!node)
			continue;
		if (node.sections) {
			let u0= 0;
			let v0= 0;
			let sectionID= 0;
			context.beginPath();
			for (let j=0; j<node.sections.length; j++) {
				let section= node.sections[j];
				let u= (section.u-centerU)*scale + width/2;
				let v= height/2 - (section.v-centerV)*scale;
				if (j == 0)
					context.moveTo(u,v);
				else
					drawSection(sectionID,u0,v0,u,v);
				u0= u;
				v0= v;
				sectionID= section.sectionID;
			}
			let node2= trackDB.nodes[node.pins[1].node];
			let u= (node2.u-centerU)*scale + width/2;
			let v= height/2 - (node2.v-centerV)*scale;
			drawSection(sectionID,u0,v0,u,v);
			context.stroke();
		}
	}
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		if (sw.switchStand)
			context.strokeStyle= "brown";
		else
			context.strokeStyle= "purple";
		context.beginPath();
		for (let j=0; j<3; j++) {
			let p= sw.points[(j+2)%3];
			let u= (p.position.x-centerU)*scale + width/2;
			let v= height/2 - (p.position.y-centerV)*scale;
			if (j == 0)
				context.moveTo(u,v);
			else
				context.lineTo(u,v);
		}
		context.stroke();
	}
	for (let j=0; j<tracks.length; j++) {
		let track= tracks[j];
		let controlPoints= track.controlPoints;
		let trackPoints= track.trackPoints;
		for (let i=0; i<controlPoints.length; i++) {
			let cp= controlPoints[i];
			if (cp.straight && cp.trackPoint)
				trackPoints[cp.trackPoint].straight=
				  cp.badStraight ? 2 : 1;
//			if (cp.badStraight)
//				console.log("badstraight "+i+" "+j+" "+
//				  cp.trackPoint);
		}
		let straight= 0;
		if (track.type == "contour") {
			context.strokeStyle= "brown";
			context.beginPath();
			for (let i=0; i<controlPoints.length; i++) {
				let cp= controlPoints[i];
				let u= (cp.position.x-centerU)*scale + width/2;
				let v= height/2 - (cp.position.y-centerV)*scale;
				if (i == 0)
					context.moveTo(u,v);
				else
					context.lineTo(u,v);
			}
		} else {
			context.strokeStyle= "blue";
			context.beginPath();
			for (let i=0; i<trackPoints.length; i++) {
				let p= trackPoints[i];
				let u= (p.x-centerU)*scale + width/2;
				let v= height/2 - (p.y-centerV)*scale;
				if (i == 0)
					context.moveTo(u,v);
				else
					context.lineTo(u,v);
				if (straight !== straight) {
					context.stroke();
					if (p.straight == 2)
						context.strokeStyle= "orange";
					else if (p.straight)
						context.strokeStyle= "cyan";
					else
						context.strokeStyle= "blue";
					context.beginPath();
					context.moveTo(u,v);
					straight= p.straight;
				}
			}
		}
		context.stroke();
		for (let i=0; i<controlPoints.length; i++) {
			let cp= controlPoints[i];
			let u= (cp.position.x-centerU)*scale + width/2;
			let v= height/2 - (cp.position.y-centerV)*scale;
			if (cp.bridge)
				context.fillStyle= "magenta";
			else if (cp.overpass)
				context.fillStyle= "cyan";
			else if (cp.calcElevation)
				context.fillStyle= "green";
			else
				context.fillStyle= "blue";
			context.fillRect(u-3,v-3,6,6);
			if (cp.name) {
				context.fillText(cp.name,u,v);
			}
			if (cp.model) {
				context.fillStyle= "yellow";
				context.fillRect(u-2,v-2,4,4);
			}
			if (cp.direction && (cp.forest || 
			  (cp.model && cp.model.size))) {
				let dx= cp.direction.x;
				let dy= -cp.direction.y;
				let w= cp.forest ?
				  cp.forest.areaw/2*scale :
				  cp.model.size.w/2*scale;
				let h= cp.forest ?
				  cp.forest.areah/2*scale :
				  cp.model.size.h/2*scale;
				context.beginPath();
				context.strokeStyle= "blue";
				context.moveTo(u-w*dx+h*dy,v-h*dx-w*dy);
				context.lineTo(u+w*dx+h*dy,v-h*dx+w*dy);
				context.lineTo(u+w*dx-h*dy,v+h*dx+w*dy);
				context.lineTo(u-w*dx-h*dy,v+h*dx-w*dy);
				context.lineTo(u-w*dx+h*dy,v-h*dx-w*dy);
				context.stroke();
			}
		}
	}
	if (selectedGroup) {
		context.fillStyle= "orange";
		for (let i=0; i<selectedGroup.length; i++) {
			let cp= selectedGroup[i];
			let u= (cp.position.x-centerU)*scale + width/2;
			let v= height/2 - (cp.position.y-centerV)*scale;
			context.fillRect(u-3,v-3,6,6);
		}
	}
	if (selected) {
		let u= (selected.position.x-centerU)*scale + width/2;
		let v= height/2 - (selected.position.y-centerV)*scale;
		context.fillStyle= "red";
		context.fillRect(u-3,v-3,6,6);
		if (selected.direction) {
			context.beginPath();
			context.strokeStyle= "red";
			context.moveTo(u,v);
			context.lineTo(u+20*selected.direction.x,
			  v-20*selected.direction.y);
			context.stroke();
		}
	}
}

//	handle mouse down event in map canvas
//	center display on shift click
//	change selection control point and set up dragging
//	add new control point on ctrl click
let mapMouseDown= function(event)
{
	let canvas= document.getElementById('canvas');
	downX= event.pageX-canvas.offsetLeft;
	downY= event.pageY-canvas.offsetTop;
//	console.log("down "+downX+" "+downY);
	let width= canvas.width;
	let height= canvas.height;
	if (event.shiftKey || moveMode) {
		centerU-= (width/2-downX)/scale;
		centerV+= (height/2-downY)/scale;
		let ll= uv2ll(centerU,centerV);
//		console.log('center '+centerU+' '+centerV+' '+scale+' '+
//		  ll.lat+' '+ll.lng);
		renderCanvas();
	} else {
		let bestD= 40;
		let bestPoint= null;
		let bestDir= false;
		let bestSize= false;
		let bestTrack= null;
		let saveBest= function(x,y,point,dir,track,size) {
			let dx= x - downX;
			let dy= y - downY;
			let d= dx*dx + dy*dy;
			if (d < bestD) {
				bestD= d;
				bestPoint= point;
				bestDir= dir;
				bestSize= size;
				bestTrack= track;
			}
		}
		for (let j=0; j<tracks.length; j++) {
			let track= tracks[j];
			let controlPoints= track.controlPoints;
			for (let i=0; i<controlPoints.length; i++) {
				let point= controlPoints[i];
				let u= (point.position.x-centerU)*scale +
				  width/2;
				let v= height/2 -
				  (point.position.y-centerV)*scale;
				saveBest(u,v,point,false,track,false);
				if (point==selected && point.direction) {
					saveBest(u+20*point.direction.x,
					  v-20*point.direction.y,point,true,
					  track,false);
				}
				if (point==selected && (point.forest ||
				  (point.model && point.model.size))) {
					let dx= point.direction.x;
					let dy= -point.direction.y;
					let w= point.forest ?
					  point.forest.areaw/2*scale :
					  point.model.size.w/2*scale;
					let h= point.forest ?
					  point.forest.areah/2*scale :
					  point.model.size.h/2*scale;
					saveBest(u+w*dx+h*dy,v-h*dx+w*dy,
					  point,false,track,[1,1]);
					saveBest(u+w*dx-h*dy,v+h*dx+w*dy,
					  point,false,track,[1,-1]);
					saveBest(u-w*dx-h*dy,v+h*dx-w*dy,
					  point,false,track,[-1,-1]);
					saveBest(u-w*dx+h*dy,v-h*dx-w*dy,
					  point,false,track,[-1,1]);
				}
			}
		}
		if (!event.ctrlKey) {
			if (selected != bestPoint)
				selectedGroup= null;
			if (selected==bestPoint &&
			  bestPoint && !bestPoint.endNode && (!bestPoint.sw ||
			   bestPoint==bestPoint.sw.points[0])) {
				dragging= bestPoint;
				draggingDir= bestDir;
				draggingSize= bestSize;
			} else {
				dragging= null;
				draggingDir= false;
				draggingSize= false;
			}
			selected= bestPoint;
			selectedTrack= bestTrack;
			renderCanvas();
		} else if (bestPoint == null) {
			let x= (downX-width/2)/scale + centerU;
			let y= centerV - (downY-height/2)/scale;
			let cp= addControlPoint(x,y);
			if (cp) {
				selected= cp;
				dragging= cp;
				selectedGroup= null;
			}
			calcTrack();
			renderCanvas();
		} else if (selected && bestPoint && selected!=bestPoint) {
			connectTracks(bestPoint,bestTrack);
			calcTrack();
			renderCanvas();
		}
	}
	event.preventDefault();
}

//	handle mouse move event in map canvas
//	move or change track direction for selected control point
let mapMouseMove= function(event)
{
	if (dragging) {
		let canvas= document.getElementById('canvas');
		let width= canvas.width;
		let height= canvas.height;
		let upX= event.pageX-canvas.offsetLeft;
		let upY= event.pageY-canvas.offsetTop;
		let x= (upX-width/2)/scale + centerU;
		let y= centerV - (upY-height/2)/scale;
		if (draggingDir) {
			let dx= x-dragging.position.x;
			let dy= y-dragging.position.y;
			if (dragging.sw) {
				let angle= dragging.forcedDirection==1 ?
				  Math.atan2(-dy,-dx) : Math.atan2(dy,dx);
				if (selectedGroup)
					rotateGroup(angle-dragging.sw.angle);
				dragging.sw.angle= angle;
			} else {
				let prevAngle= Math.atan2(dragging.direction.y,
				  dragging.direction.x);
				dragging.direction.x= dx;
				dragging.direction.y= dy;
				dragging.direction.normalize();
				dragging.forcedDirection= true;
				if (selectedGroup) {
					let angle=
					  Math.atan2(dragging.direction.y,
					  dragging.direction.x);
					rotateGroup(angle-prevAngle);
				}
			}
		} else if (draggingSize) {
			let sx= draggingSize[0];
			let sy= draggingSize[1];
			let w= x-dragging.position.x;
			let h= y-dragging.position.y;
			let dx= dragging.direction.x;
			let dy= dragging.direction.y;
			if (dragging.forest) {
				dragging.forest.areaw= 2*Math.abs(w*dx+h*dy);
				dragging.forest.areah= 2*Math.abs(h*dx-w*dy);
			} else {
				dragging.model.size.w= 2*Math.abs(w*dx+h*dy);
				dragging.model.size.h= 2*Math.abs(h*dx-w*dy);
			}
		} else {
			if (selectedGroup) {
				let dx= x-dragging.position.x;
				let dy= y-dragging.position.y;
				for (let i=0; i<selectedGroup.length; i++) {
					let cp= selectedGroup[i];
					cp.position.x+= dx;
					cp.position.y+= dy;
				}
			}
			dragging.position.x= x;
			dragging.position.y= y;
		}
		if (!selectedGroup)
			constrainDrag();
		calcTrack();
		renderCanvas();
	}
}

//	rotate the selected group of control points to match selected
//	control point track direction rotation
//	angle is change in angle
let rotateGroup= function(angle)
{
	let cs= Math.cos(angle);
	let sn= Math.sin(angle);
	for (let i=0; i<selectedGroup.length; i++) {
		let cp= selectedGroup[i];
		if (cp == selected)
			continue;
		let x= cp.position.x - dragging.position.x;
		let y= cp.position.y - dragging.position.y;
		cp.position.x= cs*x - sn*y + dragging.position.x;
		cp.position.y= cs*y + sn*x + dragging.position.y;
		if (cp.sw && cp==cp.sw.points[0])
			cp.sw.angle+= angle;
	}
}

//	handle mouse up event in map canvas
//	stop dragging
let mapMouseUp= function(e)
{
	dragging= null;
	draggingDir= false;
	draggingSize= false;
	renderCanvas();
}

//	fetch background images for map display
let updateBackgroundTiles= function()
{
	if (mapType == "route")
		return updateRouteMapTiles();
	if (mapType == "osge")
		return updateOsgeTiles();
	let scale= function(lat,zoom)
	{
		let wgs84_radius_equator= 6378137.0;
		let wgs84_radius_polar= 6356752.3142;
		let flattening= (wgs84_radius_equator-wgs84_radius_polar)/
		  wgs84_radius_equator;
		let eccentricitySquared= 2*flattening - flattening*flattening;
		let sinlat= Math.sin(lat*Math.PI/180);
		let coslat= Math.cos(lat*Math.PI/180);
		let n= wgs84_radius_equator /
		  Math.sqrt(1-eccentricitySquared*sinlat*sinlat);
		let meters_per_pixel = 2*Math.PI*n*coslat/256/Math.pow(2,zoom);
		return meters_per_pixel;
	}
	let long2x= function(lon,zoom)
	{
		return (lon+180)/360*Math.pow(2,zoom);
	}
	let lat2y= function(lat,zoom)
	{
		let latr= lat*Math.PI/180;
		return (1-Math.log(Math.tan(latr) +
		  1/Math.cos(latr)) / Math.PI) /2 * Math.pow(2,zoom);
	}
	let long2tile= function(lon,zoom)
	{
		return Math.floor((lon+180)/360*Math.pow(2,zoom));
	}
	let lat2tile= function(lat,zoom)
	{
		let latr= lat*Math.PI/180;
		return Math.floor((1-Math.log(Math.tan(latr) +
		  1/Math.cos(latr)) / Math.PI) /2 * Math.pow(2,zoom));
	}
	let tile2long= function(x,z)
	{
		return x/Math.pow(2,z)*360-180;
	}
	let tile2lat= function(y,z)
	{
		let n= Math.PI - 2*Math.PI*y/Math.pow(2,z);
		return 180/Math.PI * Math.atan(.5*(Math.exp(n)-Math.exp(-n)));
	}
	let tile2uv= function(tx,ty) {
		let lng= tile2long(tx,zoom);
		let lat= tile2lat(ty,zoom);
		let uv= ll2uv(lat,lng);
		return uv;
	}
	let zoom= mapType=="imagery" ? 16 : mapType=="topo" ? 16 :
	  mapType=="imagerytopo" ? 16 : mapType=="hydro" ? 16 : 
	  mapType=="osgehydro" ? 16 : 17;
	let makeBackgroundTile= function(tx,ty) {
		for (let i=0; i<backgroundTiles.length; i++) {
			let bgt= backgroundTiles[i];
			if (bgt.tx==tx && bgt.ty==ty)
				return;
		}
		let url= mapType=="imagery" ?
		  "https://basemap.nationalmap.gov/ArcGIS/rest/"+
		    "services/USGSImageryOnly/MapServer/tile/"+
		    zoom+"/"+ty+"/"+tx :
		 mapType=="topo" ?
		  "https://basemap.nationalmap.gov/ArcGIS/rest/"+
		    "services/USGSTopo/MapServer/tile/"+
		    zoom+"/"+ty+"/"+tx :
		 mapType=="imagerytopo" ?
		  "https://basemap.nationalmap.gov/arcgis/rest/"+
		    "services/USGSImageryTopo/MapServer/tile/"+
		    zoom+"/"+ty+"/"+tx :
		 mapType=="hydro" || mapType=="osgehydro" ?
		  "https://basemap.nationalmap.gov/arcgis/rest/"+
		    "services/USGSHydroCached/MapServer/tile/"+
		    zoom+"/"+ty+"/"+tx :
		  "http://A.tile.openstreetmap.org/"+zoom+"/"+tx+"/"+ty+".png";
		let uv00= tile2uv(tx,ty);
		let uv01= tile2uv(tx,ty+1);
		let uv10= tile2uv(tx+1,ty);
		let uv11= tile2uv(tx+1,ty+1);
		let u= .25*(uv00.u+uv01.u+uv10.u+uv11.u);
		let v= .25*(uv00.v+uv01.v+uv10.v+uv11.v);
		let wid= .5*((uv10.u-uv00.u)+(uv11.u-uv01.u));
		let hgt= -.5*((uv01.v-uv00.v)+(uv11.v-uv10.v));
		let skew= .5*((uv01.u-uv00.u)+(uv11.u-uv10.u));
		let skewv= .5*((uv10.v-uv00.v)+(uv11.v-uv01.v));
		console.log("uv "+u+" "+v+" "+wid+" "+hgt+" "+skew+" "+skewv);
		let bgt= {
			tx: tx, ty: ty, u: u, v: v, zoom: zoom,
			wid: wid, hgt: hgt, skew: skew, skewv: skewv
		};
		backgroundTiles.push(bgt);
		if (mapType == "osgehydro") {
			bgt.zoom= 20;
			let path= routeDir+fspath.sep+'TERRTEX'+fspath.sep+
			  "hydro"+bgt.tx+"-"+bgt.ty+".png";
			if (fs.existsSync(path)) {
				bgt.image= new Image();
				bgt.hydroImage= bgt.image;
				let url= "file://"+path;
				bgt.image.src= url;
//				console.log(url);
				return;
			}
		}
//		console.log(url);
		let loader= new THREE.ImageLoader();
		loader.load(url,
		  function(image) { bgt.image= image; renderMap(); },
		  null,function(){ console.err("cant load "+url) });
	}
	let ll= uv2ll(centerU,centerV);
	let tx= long2tile(ll.lng,zoom);
	let ty= lat2tile(ll.lat,zoom);
	for (let i=-2; i<=2; i++) {
		for (let j=-2; j<=2; j++) {
			makeBackgroundTile(tx+i,ty+j);
		}
	}
	if (mapType == "osgehydro")
		updateOsgeTiles();
}

//	fetch background images for map display
let updateOsgeTiles= function()
{
	let long2x= function(lon,zoom)
	{
		return (lon+180)/180*Math.pow(2,zoom);
	}
	let lat2y= function(lat,zoom)
	{
		return (90-lat)/180*Math.pow(2,zoom);
	}
	let long2tile= function(lon,zoom)
	{
		return Math.floor((lon+180)/180*Math.pow(2,zoom));
	}
	let lat2tile= function(lat,zoom)
	{
		return Math.floor((90-lat)/180*Math.pow(2,zoom));
	}
	let tile2long= function(x,z)
	{
		return x/Math.pow(2,z)*180-180;
	}
	let tile2lat= function(y,z)
	{
		return 90-y/Math.pow(2,z)*180;
	}
	let tile2uv= function(tx,ty,z) {
		let lng= tile2long(tx,z);
		let lat= tile2lat(ty,z);
		let uv= ll2uv(lat,lng);
		return uv;
	}
	let makeBackgroundTile= function(tx,ty,z) {
		for (let i=0; i<backgroundTiles.length; i++) {
			let bgt= backgroundTiles[i];
			if (bgt.tx==tx && bgt.ty==ty && bgt.zoom==z)
				return;
		}
		let uv00= tile2uv(tx,ty,z);
		let uv01= tile2uv(tx,ty+1,z);
		let uv10= tile2uv(tx+1,ty,z);
		let uv11= tile2uv(tx+1,ty+1,z);
		let u= .25*(uv00.u+uv01.u+uv10.u+uv11.u);
		let v= .25*(uv00.v+uv01.v+uv10.v+uv11.v);
		let wid= .5*((uv10.u-uv00.u)+(uv11.u-uv01.u));
		let hgt= -.5*((uv01.v-uv00.v)+(uv11.v-uv10.v));
		let skew= .5*((uv01.u-uv00.u)+(uv11.u-uv10.u));
		let skewv= .5*((uv10.v-uv00.v)+(uv11.v-uv01.v));
//		console.log("uv "+u+" "+v+" "+wid+" "+hgt+" "+skew+" "+skewv);
		let bgt= {
			tx: tx, ty: ty, zoom: z, u: u, v: v,
			wid: wid, hgt: hgt, skew: skew, skewv: skewv
		};
		backgroundTiles.push(bgt);
		let path= "/home/daj/railroads/stjlc/terrain/"+
		  z+"-"+tx+"-"+ty+".png";
//		console.log(path);
		if (fs.existsSync(path)) {
			bgt.image= new Image();
			let url= "file://"+path;
			bgt.image.src= url;
//			console.log(url);
		}
	}
	let ll= uv2ll(centerU,centerV);
	let nt= 0;
	for (let z=9; z<=17; z++) {
		tx= long2tile(ll.lng,z);
		ty= lat2tile(ll.lat,z);
		for (let i=-nt; i<=nt; i++) {
			for (let j=-nt; j<=nt; j++) {
				makeBackgroundTile(tx+i,ty+j,z);
			}
		}
		if (z == 12)
			nt= 1;
		else
			nt*= 2;
	}
	backgroundTiles.sort(function(a,b){return a.zoom-b.zoom});
}

let updateRouteMapTiles= function()
{
	let makeBackgroundTile= function(map) {
		for (let i=0; i<backgroundTiles.length; i++) {
			let bgt= backgroundTiles[i];
			if (bgt.map == map)
				return;
		}
		console.log("mapfile "+map.file);
		let image= new Image();
		image.src= "file://"+map.file;
		let bgt= {
			map: map, u: map.u, v: map.v, image: image,
			wid: map.wid, hgt: map.hgt, skew: map.skew
		};
		backgroundTiles.push(bgt);
	}
	for (let i=0; i<maps.length; i++) {
		let map= maps[i];
		makeBackgroundTile(map);
	}
}

let setMapOverlay= function(index)
{
	if (index >= maps.length)
		return;
	overlay= maps[index];
	if (!overlay.image) {
		let image= new Image();
		image.src= "file://"+overlay.file;
		overlay.image= image;
	}
}

let moveMapOverlay= function(du,dv)
{
	if (!overlay)
		return;
	overlay.u+= du;
	overlay.v+= dv;
	console.log("move "+overlay.u+" "+overlay.v);
	renderMap();
}

let scaleMapOverlay= function(mult)
{
	if (!overlay)
		return;
	overlay.scale*= mult
	overlay.wid= overlay.scale*overlay.width;
	overlay.hgt= overlay.scale*overlay.height;
	console.log("scale "+overlay.scale);
	renderMap();
}

let rotateMapOverlay= function(da)
{
	if (!overlay)
		return;
	overlay.angle+= da;
	overlay.cos= Math.cos(overlay.angle);
	overlay.sin= Math.sin(overlay.angle);
	console.log("rotate "+(overlay.angle*180/Math.PI));
	renderMap();
}

//	contrain the dragging movement of the selected control point if it is
//	connected to straights or switches
let constrainDrag= function()
{
	if (!dragging || selectedTrack.type=="contour")
		return;
	let controlPoints= selectedTrack.controlPoints;
	let i= controlPoints.indexOf(dragging);
	if (dragging.sw && alignSwitch()) {
		;
	} else if (i>0 && controlPoints[i-1].straight &&
	  controlPoints[i-1].forcedDirection) {
		moveToLine(dragging,controlPoints[i-1]);
	} else if (i<controlPoints.length-1 && controlPoints[i].straight &&
	  controlPoints[i+1].forcedDirection) {
		moveToLine(dragging,controlPoints[i+1]);
	} else if (dragging.straight && i>0 && controlPoints[i-1].straight &&
	  i<controlPoints.length-1) {
		moveToLine(dragging,controlPoints[i-1],controlPoints[i+1]);
	} else if (dragging.straight && i<controlPoints.length-2 &&
	  controlPoints[i+1].straight) {
		moveToLine(dragging,controlPoints[i+1],controlPoints[i+2]);
	} else if (i>1 && controlPoints[i-2].straight &&
	  controlPoints[i-1].straight) {
		moveToLine(dragging,controlPoints[i-2],controlPoints[i-1]);
	}
}

let topoColors= [
 { name:"ground", r:241, g:224, b:198 },
 { name:"trees", r:232, g:230, b:181 },
 { name:"water", r:179, g:228, b:242 },
 { name:"water", r:35, g:142, b:132 },
 { name:"contour", r:182, g:161, b:116 },
 { name:"bondary", r:183, g:167, b:154 },
 { name:"track", r:70, g:59, b:27 },
 { name:"road", r:111, g:111, b:101 }
];

let findTopoFeatures= function()
{
	if (mapType != "topo")
		return;
	let canvas= document.createElement("canvas");
	let context= canvas.getContext("2d");
	let getPixelType= function(x,y) {
		let pixel= context.getImageData(x,y,1,1).data;
		best= null;
		bestd= 1e10;
		for (let i=0; i<topoColors.length; i++) {
			let c= topoColors[i];
			let dr= pixel[0]-c.r;
			let dg= pixel[1]-c.g;
			let db= pixel[2]-c.b;
			let d= dr*dr + dg*dg + db*db;
			if (d < bestd) {
				bestd= d;
				best= c.name;
			}
		}
		return best;
	}
	let counts= {};
	for (let i=0; i<backgroundTiles.length; i++) {
		let bgt= backgroundTiles[i];
		if (!bgt.image)
			continue;
		context.drawImage(bgt.image,0,0);
		let w= bgt.image.width;
		let h= bgt.image.height;
		for (let x=0; x<w; x++) {
			for (let y=0; y<h; y++) {
				let type= getPixelType(x,y);
				if (!counts[type])
					counts[type]= 0;
				counts[type]++;
			}
		}
	}
	for (let i in counts) {
		if (counts.hasOwnProperty(i))
			console.log(i+" "+counts[i]);
	}
}

let saveWater= function()
{
	let getPixelType= function(context,x,y) {
		let pixel= context.getImageData(x,y,1,1).data;
//		return pixel[3]>0;
		return pixel[3]==255;
	}
	let mintx= 1e10;
	let maxtx= 0;
	let minty= 1e10;
	let maxty= 0;
	for (let i=0; i<backgroundTiles.length; i++) {
		let bgt= backgroundTiles[i];
		if (!bgt.image || !bgt.image.complete)
			continue;
		if (mintx > bgt.tx)
			mintx= bgt.tx;
		if (maxtx < bgt.tx)
			maxtx= bgt.tx;
		if (minty > bgt.ty)
			minty= bgt.ty;
		if (maxty < bgt.ty)
			maxty= bgt.ty;
	}
	let boxsz= 4;
	let wid= 256*(maxtx-mintx+1)/boxsz;
	let hgt= 256*(maxty-minty+1)/boxsz;
	console.log("size "+wid+" "+hgt+" "+
	  mintx+" "+maxtx+" "+minty+" "+maxty);
	let pixels= [];
	let get= function(i,j) {
		let v= pixels[i*wid+j]
		return v ? v : 0;
	}
	let set= function(i,j,v) {
		pixels[i*wid+j]= v;
	}
	let su0= 0;
	let sui= 0;
	let suj= 0;
	let sv0= 0;
	let svi= 0;
	let svj= 0;
	let ns= 0;
	for (let i=0; i<backgroundTiles.length; i++) {
		let bgt= backgroundTiles[i];
		if (!bgt.image || !bgt.image.complete)
			continue;
		console.log("bgt "+bgt.tx+" "+bgt.ty+" "+
		  bgt.u+" "+bgt.v+" "+bgt.wid+" "+bgt.hgt);
		let w= bgt.image.width;
		let h= bgt.image.height;
		let icanvas= document.createElement("canvas");
		icanvas.width= w;
		icanvas.height= h;
		let icontext= icanvas.getContext("2d");
		icontext.drawImage(bgt.image,0,0);
		let x0= 256*(bgt.tx-mintx);
		let y0= 256*(bgt.ty-minty);
		let ui= bgt.wid/256;
		let uj= bgt.skew/256;
		let u0= bgt.u - .5*bgt.wid - x0*ui - y0*uj + ui;
		let vi= bgt.skewv/256;
		let vj= -bgt.hgt/256;
		let v0= bgt.v + .5*bgt.hgt - x0*vi - y0*vj;
		console.log(" "+u0+" "+ui+" "+uj+" "+v0+" "+vi+" "+vj);
		su0+= u0 + ui*boxsz/2 + uj*boxsz/2;
		sui+= ui*boxsz;
		suj+= uj*boxsz;
		sv0+= v0 + vi*boxsz/2 + vj*boxsz/2;
		svi+= vi*boxsz;
		svj+= vj*boxsz;
		ns++;
		for (let x=0; x<w; x+=boxsz) {
			for (let y=0; y<h; y+=boxsz) {
				let n= 0;
				for (let i1=0; i1<boxsz; i1++) {
					for (let j1=0; j1<boxsz; j1++) {
						if (getPixelType(icontext,
						  x+i1,y+j1))
							n++;
					}
				}
				if (n == boxsz*boxsz) {
					set((x0+x)/boxsz,(y0+y)/boxsz,1);
				}
			}
		}
	}
	let u0= su0/ns;
	let ui= sui/ns;
	let uj= suj/ns;
	let v0= sv0/ns;
	let vi= svi/ns;
	let vj= svj/ns;
	console.log(" "+u0+" "+ui+" "+uj+" "+v0+" "+vi+" "+vj);
	let getXY= function(i,j) {
		return { x: u0+ui*i+uj*j, y: v0+vi*i+vj*j };
	}
	let borders= [null,{hole:true,points:[],parent:1}];
	let nbd= 1;
	let lnbd= 1;
	let findCW= function(i,j,dj) {
		if (get(i,j+dj))
			return { i:i, j:j+dj };
		if (get(i+dj,j))
			return { i:i+dj, j:j };
		if (get(i,j-dj))
			return { i:i, j:j-dj };
		if (get(i-dj,j))
			return { i:i-dj, j:j };
		return null;
	}
	let findCCW= function(ij3,ij2) {
		let i= ij3.i;
		let j= ij3.j;
		let di= ij2.i - ij3.i;
		let dj= ij2.j - ij3.j;
		let jplus= false;
//		console.log(" ccw "+i+" "+j+" "+di+" "+dj);
//		console.log("  "+(i-dj)+" "+(j+di)+" "+get(i-dj,j+di));
		if (get(i-dj,j+di))
			return { i:i-dj, j:j+di, jplus: jplus, nedge: 0 };
		jplus|= di>0;
//		console.log("  "+(i-di)+" "+(j-dj)+" "+get(i-di,j-dj));
		if (get(i-di,j-dj))
			return { i:i-di, j:j-dj, jplus: jplus, nedge: 1 };
		jplus|= dj<0;
//		console.log("  "+(i+dj)+" "+(j-di)+" "+get(i+dj,j-di));
		if (get(i+dj,j-di))
			return { i:i+dj, j:j-di, jplus: jplus, nedge: 2 };
		jplus|= di<0;
//		console.log("  "+(i+di)+" "+(j+dj)+" "+get(i+di,j+dj));
		return { i:i+di, j:j+dj, jplus: jplus, nedge: 3 };
	}
	let printPixels= function() {
		for (let i=0; i<wid; i++) {
			for (let j=0; j<hgt; j++) {
				console.log(" "+i+" "+j+" "+get(i,j));
			}
		}
	}
	let followBorder= function(i,j,hole) {
		let lb= borders[lnbd];
		let parent= ((hole && lb.hole) || (!hole && !lb.hole)) ?
		  lb.parent : lnbd;
		let points= [];
		borders.push({hole:hole,points:points,parent:parent});
		nbd++;
//		console.log("follow "+i+" "+j+" "+hole+" "+nbd+" "+lnbd);
		let ij1= findCW(i,j,hole?1:-1);
		if (!ij1) {
			points.push({i:i, j:j, nedge:4});
			set(i,j,-nbd);
			return;
		}
		let ij2= ij1;
		let ij3= { i:i, j:j };
		for (let iter=0; iter<wid*hgt; iter++) {
			points.push(ij3);
			let ij4= findCCW(ij3,ij2);
			ij3.nedge= ij4.nedge;
//			console.log(" findccw "+ij3.i+" "+ij3.j+" "+
//			  ij2.i+" "+ij2.j+" "+
//			  ij4.i+" "+ij4.j+" "+ij4.nedge);
			if (get(ij3.i,ij3.j+1)==0 && ij4.jplus) {
				set(ij3.i,ij3.j,-nbd);
			} else if (get(ij3.i,ij3.j) == 1) {
				set(ij3.i,ij3.j,nbd);
			}
			if (ij4.i==i && ij4.j==j &&
			  ij3.i==ij1.i && ij3.j==ij1.j)
				break;
			ij2= ij3;
			ij3= ij4;
		}
		if (get(i,j) != 1)
			lnbd= Math.abs(get(i,j));
//		printPixels();
	}
//	wid= 5;
//	hgt= 8;
//	pixels= [];
//	for (let i=1; i<4; i++) 
//		for (let j=1; j<4; j++)
//			set(i,j,1);
//	set(1,6,1);
	for (let i=0; i<wid; i++) {
		lnbd= 1;
		for (let j=0; j<hgt; j++) {
			let p= get(i,j);
			if (p==1 && get(i,j-1)==0) {
				followBorder(i,j,false);
			} else if (p>=1 && get(i,j+1)==0) {
				if (p > 1)
					lnbd= p;
				followBorder(i,j,true);
			}
		}
	}
	for (let i=0; i<wid; i++) {
		for (let j=0; j<hgt; j++) {
			if (get(i,j) == 1) {
				let p= getXY(i,j);
				let e= getElevation(p.x,p.y,true);
				setElevation(p.x,p.y,e);
			}
		}
	}
	let threshold=
	  parseFloat(document.getElementById('waterthreshold').value);
	let polys= [];
	for (let i=2; i<borders.length; i++) {
		let border= borders[i];
		let points= border.points;
//		console.log("border "+i+" "+border.hole+" "+border.parent+" "+
//		  points.length);
		if (border.hole || points.length<10)
			continue;
//		let p0= getXY(points[0].i,points[0].j);
//		let p1= p0;
//		let poly= [p0];
//		for (let j=0; j<points.length; j++) {
//			let p2= getXY(points[j].i,points[j].j);
//			let a= triArea(p0.x,p0.y,p1.x,p1.y,p2.x,p2.y);
//			if (Math.abs(a) > threshold) {
//				poly.push(p1);
//				p0= p1;
//			}
//			p1= p2;
//		}
		let poly= [];
		let p0= points[points.length-1];
		for (let j=0; j<points.length; j++) {
			let p1= points[j];
			let di= .5*(p1.i-p0.i);
			let dj= .5*(p1.j-p0.j);
			for (let k=0; k<p1.nedge; k++) {
				poly.push(getXY(p1.i+dj,p1.j-di));
				let t= di;
				di= -dj;
				dj= t;
			}
			p0= p1;
		}
		if (poly.length > 4)
//			polys.push(polySimp(poly,threshold));
			polys.push(poly);
//		console.log("poly "+poly.length);
	}
	console.log("polys "+polys.length);
	for (let i=0; i<polys.length; i++) {
		let poly= polys[i];
		let track= {
			controlPoints: [],
			trackPoints: [],
			dynTrackPoints: [],
			groundPoints: [],
			type: "water"
		};
//		tracks.push(track);
		let controlPoints= track.controlPoints;
		for (let j=0; j<poly.length; j++) {
			let p= poly[j];
			let z= getElevation(p.x,p.y,true);
			if (z <= 0)
				z= 0;
			let cp= { position: new THREE.Vector3(p.x,p.y,z)
			  };//, straight: true };
			controlPoints.push(cp);
		}
	}
	calcTrack();
	renderCanvas();
}

let saveImage= function()
{
	let best= null;
	let bestd= 1e10;
	let bestz= 0;
	for (let i=0; i<backgroundTiles.length; i++) {
		let bgt= backgroundTiles[i];
		if (!bgt.image || !bgt.image.complete)
			continue;
		let du= centerU-bgt.u;
		let dv= centerV-bgt.v;
		if (Math.abs(du)>.5*bgt.wid || Math.abs(dv)>.5*bgt.hgt)
			continue;
		let d= du*du + dv*dv;
		if (bgt.zoom>bestz || (bgt.zoom==bestz && bestd > d)) {
			bestd= d;
			best= bgt;
			bestz= bgt.zoom;
		}
	}
	if (!best)
		return;
	best.saved= true;
	console.log("best "+best+" "+bestz+" "+bestd+" "+centerU+" "+centerV);
	let path= routeDir+fspath.sep+'TERRTEX'+fspath.sep+
	  mapType+best.tx+"-"+best.ty+".png";
	console.log(path);
	console.log("src "+best.image.src);
	let img= best.image;
	if (mapType == "hydro")
		img= fixHydroImage(img,best);
	let dataUrl= img.toDataURL();
	let start= dataUrl.indexOf("base64,");
	let buf= Buffer.from(dataUrl.substr(start+6),"base64");
	fs.writeFileSync(path,buf);
}

let paintBackground= function(context,scale,width,height,cu,cv)
{
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track.type != "paint")
			continue;
		let trackPoints= track.trackPoints;
		let img= document.getElementById('trees');
		let pattern= context.createPattern(img,"repeat");
		//context.fillStyle= "#a8b3a9";
		context.fillStyle= pattern;
		context.beginPath();
		for (let i=0; i<trackPoints.length; i++) {
			let p= trackPoints[i];
			let u= (p.x-cu)*scale + width/2;
			let v= height/2 - (p.y-cv)*scale;
			if (i == 0)
				context.moveTo(u,v);
			else
				context.lineTo(u,v);
		}
		context.fill();
	}
}

let saveTileColors= function()
{
	let getPixelType= function(context,x,y) {
		let pixel= context.getImageData(x,y,1,1).data;
//		return pixel[3]>0;
		return pixel[3]==255;
	}
	let mintx= 1e10;
	let maxtx= 0;
	let minty= 1e10;
	let maxty= 0;
	for (let i=0; i<backgroundTiles.length; i++) {
		let bgt= backgroundTiles[i];
		if (!bgt.image || !bgt.image.complete)
			continue;
		if (mintx > bgt.tx)
			mintx= bgt.tx;
		if (maxtx < bgt.tx)
			maxtx= bgt.tx;
		if (minty > bgt.ty)
			minty= bgt.ty;
		if (maxty < bgt.ty)
			maxty= bgt.ty;
	}
	let scales= [];
	let su0= 0;
	let sui= 0;
	let suj= 0;
	let sv0= 0;
	let svi= 0;
	let svj= 0;
	let ns= 0;
	for (let i=0; i<backgroundTiles.length; i++) {
		let bgt= backgroundTiles[i];
		if (!bgt.image || !bgt.image.complete)
			continue;
//		console.log("bgt "+bgt.tx+" "+bgt.ty+" "+
//		  bgt.u+" "+bgt.v+" "+bgt.wid+" "+bgt.hgt);
		if (!scales[bgt.zoom])
			scales[bgt.zoom]= { su0: 0, sui: 0, suj: 0,
			  sv0: 0, svi: 0, svj: 0, ns: 0 };
		let scale= scales[bgt.zoom];
		let x0= 256*(bgt.tx-mintx);
		let y0= 256*(bgt.ty-minty);
		let ui= bgt.wid/256;
		let uj= bgt.skew/256;
		let u0= bgt.u - .5*bgt.wid - x0*ui - y0*uj + ui;
		let vi= bgt.skewv/256;
		let vj= -bgt.hgt/256;
		let v0= bgt.v + .5*bgt.hgt - x0*vi - y0*vj;
//		console.log(" "+u0+" "+ui+" "+uj+" "+v0+" "+vi+" "+vj);
		scale.su0+= u0 + ui/2 + uj/2;
		scale.sui+= ui;
		scale.suj+= uj;
		scale.sv0+= v0 + vi/2 + vj/2;
		scale.svi+= vi;
		scale.svj+= vj;
		scale.ns++;
	}
	for (let i=0; i<scales.length; i++) {
		if (!scales[i])
			continue;
		let scale= scales[i];
		scale.u0= scale.su0/scale.ns;
		scale.ui= scale.sui/scale.ns;
		scale.uj= scale.suj/scale.ns;
		scale.v0= scale.sv0/scale.ns;
		scale.vi= scale.svi/scale.ns;
		scale.vj= scale.svj/scale.ns;
		console.log(" "+i+" "+scale.u0+" "+scale.ui+" "+scale.uj+" "+
		  scale.v0+" "+scale.vi+" "+scale.vj+" "+scale.ns);
	}
	let getXY= function(i,j,scale) {
		return { x: scale.u0+scale.ui*i+scale.uj*j,
		  y: scale.v0+scale.vi*i+scale.vj*j };
	}
	let tx= centerTX + Math.round(centerU/2048);
	let tz= centerTZ + Math.round(centerV/2048);
	let tile= findTile(tx,tz);
	let cu= 2048*(tx-centerTX);
	let cv= 2048*(tz-centerTZ);
	console.log("save tile colors "+tx+" "+tz+" "+cu+" "+cv+" "+
	  tile.filename);
	let initSums= function() {
		let sums= [];
		for (let i=0; i<16; i++)
			for (let j=0; j<16; j++)
				sums[i*16+j]= { r:0, g:0, b:0, n:0 };
		return sums;
	}
	let sums= initSums();
	for (let i=0; tile.patchModels && i<tile.patchModels.length; i++) {
		let tpm= tile.patchModels[i];
		sums[tpm[0]*16+tpm[1]].sqSums= initSums();
	}
	let addColor= function(sum,pixel) {
		sum.r+= pixel[0];
		sum.g+= pixel[1];
		sum.b+= pixel[2];
		sum.n++;
	}
	for (let i=0; i<backgroundTiles.length; i++) {
		let bgt= backgroundTiles[i];
		if (!bgt.image || !bgt.image.complete)
			continue;
		let scale= scales[bgt.zoom];
		console.log("bgt "+bgt.tx+" "+bgt.ty+" "+
		  bgt.u+" "+bgt.v+" "+bgt.wid+" "+bgt.hgt+" "+bgt.zoom);
		let w= bgt.image.width;
		let h= bgt.image.height;
		let icanvas= document.createElement("canvas");
		icanvas.width= w;
		icanvas.height= h;
		let icontext= icanvas.getContext("2d");
		icontext.drawImage(bgt.image,0,0);
		let x0= 256*(bgt.tx-mintx);
		let y0= 256*(bgt.ty-minty);
		for (let x=0; x<w; x++) {
			for (let y=0; y<h; y++) {
				let xy= getXY(x0+x,y0+y,scale);
				let u= xy.x-cu;
				let v= xy.y-cv;
				if (u<-1024 || u>1024 || v<-1024 || v>1024)
					continue;
				let pixel= icontext.getImageData(x,y,1,1).data;
				if (pixel[3] == 0)
					continue;
				let pi= Math.floor((1024-xy.y+cv)/128);
				let pj= Math.floor((xy.x+1024-cu)/128);
				if (pi>=0 && pi<=15 && pj>=0 && pj<=15) {
					let sum= sums[pi*16+pj];
					addColor(sum,pixel);
					if (sum.sqSums) {
						let sqi= Math.floor(
						  (1024-xy.y+cv-128*pi)/8);
						let sqj= Math.floor(
						  (xy.x+1024-cu-128*pj)/8);
						if (sqi>=0 && sqi<=15 &&
						  sqj>=0 && sqj<=15) {
							addColor(sum.sqSums[
							  sqi*16+sqj],pixel);
						}
					}
				} else {
					console.log("pipj "+pi+" "+pj+" "+
					  u+" "+v);
				}
			}
		}
	}
	let colorIndex= function(sum) {
		if (sum.n == 0)
			return 0;
		let r= sum.r/sum.n;
		let g= sum.g/sum.n;
		let b= sum.b/sum.n;
		let colors= [
			{ index: 0, r:90, g:116, b:126 },//forest
			{ index: 1, r:138, g:164, b:156 },//field
			{ index: 3, r:147, g:180, b:165 },//field20
			{ index: 4, r:156, g:186, b:173 },//field40
			{ index: 2, r:183, g:191, b:188 }//fieldw
		];
		let best= 0;
		let bestd= 1e10;
		for (let i=0; i<colors.length; i++) {
			let c= colors[i];
			let dr= r - c.r;
			let dg= g - c.g;
			let db= b - c.b;
			let d= dr*dr + dg*dg + db*db;
			if (d < bestd) {
				bestd= d;
				best= c.index;
			}
		}
		return best;
	}
	tile.colors= [];
	tile.patchColors= [];
	for (let i=0; i<16; i++) {
		for (let j=0; j<16; j++) {
			let s= sums[i*16+j];
			tile.colors[i*16+j]= colorIndex(s);
			if (s.sqSums) {
				let sqc= [];
				for (let k=0; k<s.sqSums.length; k++)
					sqc[k]= colorIndex(s.sqSums[k]);
				tile.patchColors[i*16+j]= sqc;
			}
			if (s.n > 0) {
				console.log("color "+i+" "+j+" "+
				  (s.r/s.n)+" "+(s.g/s.n)+" "+
				  (s.b/s.n)+" "+s.n+" "+colorIndex(s));
			}
		}
	}
}
