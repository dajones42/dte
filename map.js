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
		context.fillText(tile.filename,u,v);
	}
	for (let i=0; i<backgroundTiles.length; i++) {
		let bgt= backgroundTiles[i];
		if (!bgt.image || !bgt.image.complete)
			continue;
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
		context.drawImage(bgt.image,x0,y0,w,h,-w/2,-h/2,w,h);
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
	context.strokeStyle= "fuchsia";//"lightblue";
	for (let i=0; i<tiles.length; i++) {
		let tile= tiles[i];
		let u= (2048*(tile.x-centerTX)-1024-centerU)*scale + width/2;
		let v= height/2 - (2048*(tile.z-centerTZ)+1024-centerV)*scale;
		context.strokeRect(u,v,2048*scale,2048*scale);
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
			if (cp.straight)
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
	if (event.shiftKey) {
		centerU-= (width/2-downX)/scale;
		centerV+= (height/2-downY)/scale;
		let ll= uv2ll(centerU,centerV);
		console.log('center '+centerU+' '+centerV+' '+scale+' '+
		  ll.lat+' '+ll.lng);
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
			selected= bestPoint;
			selectedTrack= bestTrack;
			if (bestPoint && !bestPoint.endNode && (!bestPoint.sw ||
			   bestPoint==bestPoint.sw.points[0])) {
				dragging= bestPoint;
				draggingDir= bestDir;
				draggingSize= bestSize;
			} else {
				dragging= null;
				draggingDir= false;
				draggingSize= false;
			}
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
	  mapType=="imagerytopo" ? 16 : mapType=="hydro" ? 16 : 17;
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
		 mapType=="hydro" ?
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
			tx: tx, ty: ty, u: u, v: v,
			wid: wid, hgt: hgt, skew: skew, skewv: skewv
		};
		backgroundTiles.push(bgt);
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
