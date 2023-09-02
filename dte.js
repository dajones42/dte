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

//	Code for Dynamic Track Editor
//

const THREE= require('three');
//const proj4= require('proj4');

//	initiallizes menu, keyboard events and displays
window.onload= function() {
	setupMenu();
	window.addEventListener('keydown',function(e) {
		if (e.keyCode == 37) {
			cameraLeft();
		} else if (e.keyCode == 38) {
			scale*= 1.4;
			renderCanvas();
			e.preventDefault();
		} else if (e.keyCode == 39) {
			cameraRight();
		} else if (e.keyCode == 40) {
			scale/= 1.4;
			renderCanvas();
			e.preventDefault();
		} else if (e.keyCode == 13) {
			updateModels(true);
			renderCanvas();
		} else if (e.key=='1') {
			setMapOverlay(0);
		} else if (e.key=='2') {
			setMapOverlay(1);
		} else if (e.key=='a') {
			moveMapOverlay(-1,0);
		} else if (e.key=='d') {
			moveMapOverlay(1,0);
		} else if (e.key=='w') {
			moveMapOverlay(0,1);
		} else if (e.key=='s') {
			moveMapOverlay(0,-1);
		} else if (e.key=='r') {
			scaleMapOverlay(1.001);
		} else if (e.key=='f') {
			scaleMapOverlay(1/1.001);
		} else if (e.key=='k') {
			rotateMapOverlay(-.1*Math.PI/180);
		} else if (e.key=='l') {
			rotateMapOverlay(.1*Math.PI/180);
		} else if (e.key=='m') {
			moveMode= !moveMode;
		} else {
			console.log("keydown "+e.keyCode+" "+e.key);
		}
		return true;
	});
	setupMap();
	setupProfile();
}

//	display error in case user can't see console
window.onerror= function(msg,url,line)
{
	alert("ERROR: "+msg+"\n"+url+":"+line);
	return false;
}

let trackDB= null;		// MSTS TDB data object
let centerTX= 0;		// MSTS tile at center of route
let centerTZ= 0;
let scale= 1;			// current scale for displays
let downX= 0;
let downY= 0;
//let trackPoints= [];
//let groundPoints= [];
//let controlPoints= [];
let selected= null;		// currently selected control point
let selectedTrack= null;	// track selected control point belongs to
let selectedGroup= null;	// optional group of other selected points
let dragging= null;		// selected point currently being dragged
let mapType= "topo";		// type of map used for background images
let projection= null;		// proj4 projection object
let proj4Str= "";		// string defining map projection
let tracks= [];			// array of user added tracks
let switches= [];		// array of user added switches
let trackChanged= false;
let addToTrackDB= false;	// true if adding track to existing TDB
let maps= null;			// array of local maps

//	finds the center of MSTS route using TDB data
//	adjusts default display settings
let findCenter= function()
{
	let minTX= 1e10;
	let maxTX= -1e10;
	let minTZ= 1e10;
	let maxTZ= -1e10;
	for (let i=0; trackDB && i<trackDB.nodes.length; i++) {
		let node= trackDB.nodes[i];
		if (!node || node.sections)
			continue;
		if (minTX > node.tx)
			minTX= node.tx;
		if (maxTX < node.tx)
			maxTX= node.tx;
		if (minTZ > node.tz)
			minTZ= node.tz;
		if (maxTZ < node.tz)
			maxTZ= node.tz;
	}
	for (let i=0; i<tiles.length; i++) {
		let tile= tiles[i];
		if (minTX > tile.x)
			minTX= tile.x;
		if (maxTX < tile.x)
			maxTX= tile.x;
		if (minTZ > tile.z)
			minTZ= tile.z;
		if (maxTZ < tile.z)
			maxTZ= tile.z;
	}
	let toInt= function(x) {
		return x>=0 ? Math.floor(x) : Math.ceil(x);
	}
	centerTX= toInt(.5*(minTX+maxTX));
	centerTZ= toInt(.5*(minTZ+maxTZ));
	let canvas= document.getElementById("canvas");
	let sx= canvas.width/(2048*(maxTX-minTX+2));
	let sz= canvas.height/(2048*(maxTZ-minTZ+2));
	scale= sx<sz ? sx : sz;
	let ll= uv2ll(0,0);
//	console.log("center "+centerTX+" "+centerTZ+" "+ll.lat+" "+ll.lng);
}

//	Calculates U&V coordinates used for displays for trackDB contents.
let calcTrackDBUV= function()
{
	for (let i=0; trackDB && i<trackDB.nodes.length; i++) {
		let node= trackDB.nodes[i];
		if (!node)
			continue;
		if (node.sections) {
			for (let j=0; j<node.sections.length; j++) {
				let section= node.sections[j];
				section.u= 2048*(section.tx-centerTX) +
				  section.x;
				section.v= 2048*(section.tz-centerTZ) +
				  section.z;
			}
		} else {
			node.u= 2048*(node.tx-centerTX) + node.x;
			node.v= 2048*(node.tz-centerTZ) + node.z;
		}
	}
}

let convertTrackDB= function()
{
	for (let i=0; trackDB && i<trackDB.nodes.length; i++) {
		let node= trackDB.nodes[i];
		if (!node || !node.shape)
			continue;
		let sw= { points: [ null, null, null ] };
		sw.shapeID= node.shape;
		sw.angle= Math.PI/2-node.ay+Math.PI;
		sw.grade= -node.ax;
		sw.angles= [];
		sw.offsets= [];
		calcSwitchOffsets(sw);
		node.sw= sw;
		switches.push(sw);
	}
	let getPin= function(node,id) {
		for (let i=0; i<node.pins.length; i++)
			if (node.pins[i].node == id)
				return i;
		return -1;
	}
	let getPoints= function(node,pin) {
		if (pin < 1)
			return 0;
		let shape= trackDB.tSection.shapes[node.sw.shapeID];
		return shape.paths[pin-1].sections.length;
	}
	for (let i=0; trackDB && i<trackDB.nodes.length; i++) {
		let node= trackDB.nodes[i];
		if (!node || !node.sections)
			continue;
		let track= addTrack();
		let prevStraight= false;
		let node1= trackDB.nodes[node.pins[0].node];
		let node2= trackDB.nodes[node.pins[1].node];
		let pin1= getPin(node1,i);
		let pin2= getPin(node2,i);
		let n1= getPoints(node1,pin1);
		let n2= getPoints(node2,pin2);
		for (let j=0; j<node.sections.length; j++) {
			let section= node.sections[j];
			let straight= trackDB.tSection.sections[
			  section.sectionID].length>0;
			let cp= { position: new THREE.Vector3(section.u,
			  section.v,section.y) };
			let a= Math.PI/2-section.ay;
			cp.direction= new THREE.Vector2(Math.cos(a),
			  Math.sin(a)).normalize();
			cp.straight= straight;
			if (!straight && !prevStraight)
				cp.forcedDirection= true;
			prevStraight= straight;
			if (n1<=j && j<=node.sections.length-n2)
				track.controlPoints.push(cp);
		}
		if (n2 == 0) {
			let cp= { position: new THREE.Vector3(node2.u,
			  node2.v,node2.y) };
			let a= Math.PI/2-node2.ay;
			cp.direction= new THREE.Vector2(Math.cos(a),
			  Math.sin(a)).normalize();
			track.controlPoints.push(cp);
		}
		if (node1.sw) {
			let cp= track.controlPoints[0];
			cp.sw= node1.sw;
			node1.sw.points[pin1]= cp;
		}
		if (node2.sw) {
			let n= track.controlPoints.length;
			let cp= track.controlPoints[n-1];
			cp.sw= node2.sw;
			node2.sw.points[pin2]= cp;
		}
	}
	calcTrack();
}

//	update all displays
let renderCanvas= function()
{
	renderMap();
	renderProfile();
	render3D();
	if (selectedTrack && selectedTrack.controlPoints.length>1)
		printTrack(selectedTrack.flatCurves,
		  selectedTrack.dynTrackCurves);
}

//	finds the track direction for a TDB end node
//	might not be used currently
let findTrackDirection= function(node)
{
	let vNode= trackDB.nodes[node.pins[0].node];
	let other= null;
	let angle= 0;
	if (node.id == vNode.pins[1].node) {
		other= vNode.sections[vNode.sections.length-1];
		let section= trackDB.tSection.sections[other.sectionID];
		if (section && section.radius)
			angle= -section.angle;
	} else if (vNode.sections.length>1) {
		other= vNode.sections[1];
		let section= trackDB.tSection.sections[
		  vNode.sections[0].sectionID];
		if (section && section.radius)
			angle= -section.angle;
	} else {
		other= trackDB.nodes[vNode.pins[1].node];
	}
	node.dir= new THREE.Vector3(node.u-other.u,node.v-other.v,
	  node.y-other.y);
	node.dir.normalize();
	if (angle)
		node.dir.applyAxisAngle(new THREE.Vector3(0,0,1),
		  .5*angle*Math.PI/180);
}

//	Calculates the curves needed to implement all tracks.
//	Updates switch position and orientation,
//	then calculates curves in horizontal plane for all track,
//	then calculates elevations for control points,
//	then calculates grades at switches,
//	and finally calculates rotated curves for grades.
let calcTrack= function()
{
	trackChanged= true;
	updateSwitches();
	for (let i=0; i<tracks.length; i++) {
		calcFlatTrack(tracks[i]);
	}
	calcCPElevations();
	calcSwitchGrades();
	for (let i=0; i<tracks.length; i++)
		calcDynTrack(tracks[i]);
}

//	Calculates curves for a single track in horizontal plane.
//	First calculates track direction at each control point,
//	then adds points to make sure all curves are simple and less then 180
//	degrees of turn, then calculates the radius of curves and length of
//	straights and finally calculates distance down the track between points.
let calcFlatTrack= function(track)
{
	let controlPoints= track.controlPoints;
	if (controlPoints.length < 2) {
		if (controlPoints.length == 1)
			controlPoints[0].distance= 0;
		return;
	}
	calcDirection(track);
	let points= [];
	for (let i=0; i<controlPoints.length; i++) {
		let cp= controlPoints[i];
		points.push({
		  position: new THREE.Vector2(cp.position.x,cp.position.y),
		  direction: new THREE.Vector2(cp.direction.x,cp.direction.y).
		   normalize(),
		  controlPoint: cp,
		  straight: cp.straight
		});
	}
	points= addSCurvePoints(points);
	points= addLongCurvePoints(points);
	let curves= calcCurves(points);
	track.flatCurves= curves;
	track.flatPoints= points;
	calcDistance(track,points,true);
}

//	Calculates curves and straights needed for rotated track shapes.
//	Adds extra points to allow for smooth grade changes,
//	then calculates track points used in displays,
//	ground elevation below the track used in profile display.
//	Calculates grades and elevations intermediate points,
//	then assigns elevations to track shapes to smooth grade changes,
//	and finally calculates curve radius and length of straights.
let calcDynTrack= function(track)
{
	if (track.controlPoints.length < 2)
		return;
	calcGrades(track);
//	fitFixedShapes(track,track.flatCurves);
	let points= addExtraPoints(track.flatPoints,track.flatCurves);
	let curves= calcCurves(points);
	track.trackPoints= makeTrackPoints(points,curves);
	calcDistance(track,points,false);
	makeGroundPoints(track,true);
	track.dynTrackPoints= points;
	assignElevation(track,track.dynTrackPoints);
	track.dynTrackCurves= calcRotPlaneCurves(track.dynTrackPoints);
}

//	returns square of distance between a point and a line in 2D
let lineDistSq= function(x,y,x1,y1,x2,y2)
{
	var dx= x2-x1;
	var dy= y2-y1;
	var d= dx*dx + dy*dy;
	var n= dx*(x-x1) + dy*(y-y1);
	if (d > 0) {
		dx= x1 + dx*n/d - x;
		dy= y1 + dy*n/d - y;
	}
	return dx*dx + dy*dy;
}

//	Calculates curve radius and straight length for a list of 2D points
//	and builds a list of curve objects.
let calcCurves= function(points)
{
	let curves= [];
	for (let i=0; i<points.length-1; i++) {
		let p1= points[i];
		let p2= points[i+1];
		let c= calcCurve(p1.position,p2.position,
		  p1.direction,p2.direction);
		curves.push(c);
		if (p1.controlPoint && p1.controlPoint.straight) {
			p1.controlPoint.badStraight= c.bad ? true : false;
		}
		if (p1.controlPoint)
			c.controlPoint= p1.controlPoint;
//		if (c.bad) {
//			console.log("badcurve "+i+" "+c.angle+" "+c.radius+" "+
//			  c.len1+" "+c.len2+" "+c.bad);
//			if (p1.controlPoint)
//				console.log(" "+p1.controlPoint.straight+" "+
//				  p1.controlPoint.badStraight+" "+
//				  points.length);
//			console.log(" "+p1.position.x+" "+p1.position.y+" "+
//			  p1.direction.x+" "+p1.direction.y);
//			console.log(" "+p2.position.x+" "+p2.position.y+" "+
//			  p2.direction.x+" "+p2.direction.y);
//		}
	}
	return curves;
}

//	Calculates the radius and angle needed between points p1 and p2
//	with track directions d1 and d2, repectively.
//	Adds a straight at one end or the other as needed.
//	Returns a curve object with the results.
//	The curve object will contain a bad==true value if there is an
//	alignment problem.
let calcCurve= function(p1,p2,d1,d2)
{
	p1= new THREE.Vector2(p1.x,p1.y);
	p2= new THREE.Vector2(p2.x,p2.y);
	d1= new THREE.Vector2(d1.x,d1.y);
	d1.normalize();
	d2= new THREE.Vector2(d2.x,d2.y);
	d2.normalize();
	let dp= p2.clone().sub(p1);
	dp.normalize();
	let dot= d1.dot(d2);
	let pi= segSegInt(p1,p1.clone().add(d1),p2,p2.clone().add(d2));
	if (pi.d==0 || dot<=-.999999 || dot>=.999999) {
		// colinear (ok) or parallel directions (not ok)
		return { angle: 0, radius: 0, len1: p1.distanceTo(p2),
		  len2: 0, bad: (d1.dot(dp)<.999999 || d2.dot(dp)<.999999) };
	}
	let angle= Math.acos(dot);
	if (pi.s<=0 || pi.t>=0) {
		// intersection pi not between p1 and p2
		return { angle: angle, radius: 0, len1: 0,
		  len2: p1.distanceTo(p2), bad: true };
	}
	let t1= p1.distanceTo(pi);
	let t2= p2.distanceTo(pi);
	let t= t1>t2 ? t2 : t1;
	let radius= t/Math.tan(angle/2);
	if (radius < 1)
		radius= 0;
	if (d1.cross(d2) < 0)
		angle= -angle;
	return { angle: angle, radius: radius, len1: t1>t2 ? t1-t2 : 0,
	  len2: t1>t2 ? 0 : t2-t1 };
}

//	Implements the Edit menu Equalize Radius feature.
//	Tries to update the track direction at the selected control point
//	so that the curve radius is the same on either side.
//	Uses the bisection method on direction vectors.
let equalizeCurveRadius= function()
{
	if (!selected || selected.straight)
		return;
	let i= selectedTrack.controlPoints.indexOf(selected);
	if (i==0 || i==selectedTrack.length-1)
		return;
	console.log("eqr "+i);
	let cp0= selectedTrack.controlPoints[i-1];
	let cp2= selectedTrack.controlPoints[i+1];
	if (cp0.straight)
		return;
	let lo= new THREE.Vector3(selected.position.x-cp0.position.x,
	  selected.position.y-cp0.position.y,0).normalize();
	let hi= new THREE.Vector3(cp2.position.x-selected.position.x,
	  cp2.position.y-selected.position.y,0).normalize();
	if (lo.dot(hi) <= 0)
		return;
	let objective= function(x) {
		let dir= lo.clone().lerp(hi,x);
		console.log("eqrad "+x+" "+dir.x+" "+dir.y);
		selected.direction= dir;
		let c1= calcCurve(cp0.position,selected.position,cp0.direction,
		  dir);
		let c2= calcCurve(selected.position,cp2.position,dir,
		  cp2.direction);
		if (c1.bad || c2.bad || (c1.len2>0 && c2.len1>0)) {
			console.log("aborteqr "+c1.bad+" "+c2.bad+" "+
			  c1.len2+" "+c2.len1);
			return 1e10;
		}
//		let deg= radius2deg(Math.min(c1.radius,c2.radius));
		let deg= radius2deg(c1.radius)+radius2deg(c2.radius);
		console.log("eqrad "+deg+" "+c1.radius+" "+c2.radius+" "+
		  c1.len1+" "+c1.len2+" "+c2.len1+" "+c2.len2);
		return deg;
	}
	let x= gsOpt(.01,.99,objective,1e-3);
	selected.direction= lo.clone().lerp(hi,x);
	selected.forcedDirection= true;
	calcTrack();
	renderCanvas();
	return;
	for (let i=0; i<12; i++) {
		let dir= lo.clone().add(hi).normalize();
		selected.direction= dir;
		let c1= calcCurve(cp0.position,selected.position,cp0.direction,
		  dir);
		let c2= calcCurve(selected.position,cp2.position,dir,
		  cp2.direction);
		if (c1.bad || c2.bad || (c1.len2>0 && c2.len1>0)) {
			console.log("aborteqr "+c1.bad+" "+c2.bad+" "+
			  c1.len2+" "+c2.len1);
			return;
		}
		console.log("eqrad "+i+" "+c1.radius+" "+c2.radius+" "+
		  c1.len1+" "+c1.len2+" "+c2.len1+" "+c2.len2);
		console.log(" "+
		  dir.x+" "+dir.y+" "+lo.x+" "+lo.y+" "+hi.x+" "+hi.y);
		let diff= c1.radius - c2.radius;
		if (i>10 && Math.abs(diff)>5) {
			console.log("aborteqr "+i+" "+diff);
			return;
		}
		if (c1.radius > c2.radius)
			lo= dir;
		else
			hi= dir;
	}
	selected.direction= lo.clone().add(hi).normalize();
	selected.forcedDirection= true;
	calcTrack();
	renderCanvas();
}

//	Calculates the common radius needed for two circles that go through
//	points p1 and p2 to meet each other if their centers are on lines
//	perp1 and perp2 respectively.
//	Uses the bisection method.
let optRadius= function(p1,p2,perp1,perp2)
{
//	console.log("p1 "+p1.x+" "+p1.y+" "+perp1.x+" "+perp1.y);
//	console.log("p2 "+p2.x+" "+p2.y+" "+perp2.x+" "+perp2.y);
	let length= p1.distanceTo(p2);
	let lo= length/4;
	let hi= 10*length;
	for (let i=0; i<15; i++) {
		let r= .5*(hi+lo);
		let c1= p1.clone().add(perp1.clone().multiplyScalar(r));
		let c2= p2.clone().add(perp2.clone().multiplyScalar(r));
		let r1= c1.distanceTo(c2);
//		console.log(" r "+i+" "+r1+" "+r+" "+lo+" "+hi);
		if (r1 < 2*r)
			hi= r;
		else
			lo= r;
	}
	return .5*(hi+lo);
}

//	Adds intermediate points where ever an S curve is required between
//	the existing points so that no S curves are needed in the resulting
//	point list.
let addSCurvePoints= function(pointsIn)
{
	let pointsOut= [ pointsIn[0] ];
	for (let i=0; i<pointsIn.length-1; i++) {
		if (pointsIn[i].straight) {
			pointsOut.push(pointsIn[i+1]);
			continue;
		}
		let p1= pointsIn[i].position;
		let p2= pointsIn[i+1].position;
		let d1= pointsIn[i].direction;
		let d2= pointsIn[i+1].direction;
		let dp= p2.clone().sub(p1);
		dp.normalize();
		let dot1= dp.dot(d1);
		let dot2= dp.dot(d2);
		let cross1= d1.cross(dp);
		let cross2= dp.cross(d2);
//		console.log("p1 "+p1.x+" "+p1.y+" "+d1.x+" "+d1.y);
//		console.log("p2 "+p2.x+" "+p2.y+" "+d2.x+" "+d2.y);
//		console.log("dot1 "+dot1+" "+cross1);
//		console.log("dot2 "+dot2+" "+cross2);
		if (dot1>0 && dot2>0 &&
		  ((cross1>0 && cross2<0) || (cross1<0 && cross2>0))) {
			// simple S curve
			let perp1= cross1>0 ? new THREE.Vector2(-d1.y,d1.x) :
			  new THREE.Vector2(d1.y,-d1.x);
			let perp2= cross2>0 ? new THREE.Vector2(-d2.y,d2.x) :
			  new THREE.Vector2(d2.y,-d2.x);
			let r= optRadius(p1,p2,perp1,perp2);
			let c1= p1.clone().add(perp1.clone().multiplyScalar(r));
			let c2= p2.clone().add(perp2.clone().multiplyScalar(r));
			let c= c2.add(c1).multiplyScalar(.5);
			let dc= cross1>0 ?
			  new THREE.Vector2(c1.y-c.y,c.x-c1.x) :
			  new THREE.Vector2(c.y-c1.y,c1.x-c.x);
			dc.normalize();
			pointsOut.push({ position: c, direction: dc });
		} else if ((dot1>0 && dot2<0) || (dot1<0 && dot2>0)) {
			// return loop S curve
			let perp1= (dot1<0 && cross2>0) ||
			  (dot1>0 && cross1<0) ?
			  new THREE.Vector2(-d1.y,d1.x) :
			  new THREE.Vector2(d1.y,-d1.x);
			let perp2= (dot2<0 && cross1>0) ||
			  (dot2>0 && cross2<0) ?
			  new THREE.Vector2(-d2.y,d2.x) :
			  new THREE.Vector2(d2.y,-d2.x);
			let r= optRadius(p1,p2,perp1,perp2);
			let c1= p1.clone().add(perp1.clone().multiplyScalar(r));
			let c2= p2.clone().add(perp2.clone().multiplyScalar(r));
			let c= c2.add(c1).multiplyScalar(.5);
			let dc= (dot1<0 && cross2>0) ||
			  (dot1>0 && cross1<0) ?
			  new THREE.Vector2(c1.y-c.y,c.x-c1.x) :
			  new THREE.Vector2(c.y-c1.y,c1.x-c.x);
			dc.normalize();
			pointsOut.push({ position: c, direction: dc });
//			console.log("add s "+c.x+" "+c.y+" "+dc.x+" "+dc.y);
		} else if (dot1<0 && dot2<0 &&
		  ((cross1<0 && cross2>0) || (cross1>0 && cross2<0))) {
			// cross over S curve
			let c= p1.clone().add(p2).multiplyScalar(.5);
			let dc= cross1>0 ?
			  new THREE.Vector2(-dp.y,dp.x) :
			  new THREE.Vector2(dp.y,-dp.x);
			dc.normalize();
			pointsOut.push({ position: c, direction: dc });
//			console.log("add s "+c.x+" "+c.y+" "+dc.x+" "+dc.y);
		}
		pointsOut.push(pointsIn[i+1]);
	}
	return pointsOut;
}

//	Adds intermediate points where ever a turn of 180 degrees or more
//	is required between the existing points.
let addLongCurvePoints= function(pointsIn)
{
	let pointsOut= [ pointsIn[0] ];
	for (let i=0; i<pointsIn.length-1; i++) {
		if (pointsIn[i].straight) {
			pointsOut.push(pointsIn[i+1]);
			continue;
		}
		let p1= pointsIn[i].position;
		let p2= pointsIn[i+1].position;
		let d1= pointsIn[i].direction;
		let d2= pointsIn[i+1].direction;
		let dp= p2.clone().sub(p1);
		dp.normalize();
		let dot1= dp.dot(d1);
		let dot2= dp.dot(d2);
		let cross1= d1.cross(dp);
		let cross2= dp.cross(d2);
//		console.log("p1 "+p1.x+" "+p1.y+" "+d1.x+" "+d1.y);
//		console.log("p2 "+p2.x+" "+p2.y+" "+d2.x+" "+d2.y);
//		console.log("dot1 "+dot1+" "+cross1);
//		console.log("dot2 "+dot2+" "+cross2);
		if (dot1<=0 && dot2<=0) {
			let pi= segSegInt(p1,p1.clone().add(d1),
			  p2,p2.clone().add(d2));
			let offset= p1.distanceTo(p2);
			if (pi.d != 0) {
				let t1= p1.distanceTo(pi);
				let t2= p2.distanceTo(pi);
				let t= t1>t2 ? t1 : t2;
				let angle= Math.acos(d1.dot(d2));
//				console.log("angle "+angle+" "+
//				  angle*180/Math.PI);
				let radius= t/Math.tan(angle/2);
//				console.log("r "+radius+" "+t1+" "+t2);
				offset= radius*(1+Math.cos(angle/2));
			}
			let perp= cross1<0 ?
			  new THREE.Vector2(-dp.y,dp.x) :
			  new THREE.Vector2(dp.y,-dp.x);
			let p= p1.clone().add(p2).multiplyScalar(.5).add(
			  perp.multiplyScalar(offset));
			pointsOut.push({ position: p, direction: dp });
//			console.log("add l "+p.x+" "+p.y+" "+dp.x+" "+dp.y);
		}
		pointsOut.push(pointsIn[i+1]);
	}
	return pointsOut;
}

//	Adds extra points along straights and curves to allow smooth
//	grade changes.
//	Makes all straights less then 100 meters and all curves less then
//	10 degrees of turn.
let addExtraPoints= function(pointsIn,curves)
{
	let pointsOut= [ pointsIn[0] ];
	for (let i=0; i<pointsIn.length-1; i++) {
		let p= pointsIn[i];
		let p1= p.position.clone();
		let dir= p.direction;
		let c= curves[i];
		if (c.bad) {
			pointsOut.push(pointsIn[i+1]);
			continue;
		}
		if (c.len1 > 0) {
			let m= Math.ceil(c.len1/100);
			for (let j=0; j<m; j++) {
				pointsOut[pointsOut.length-1].straight= true;
				p1.add(dir.clone().multiplyScalar(c.len1/m));
//			for (let sum=0; sum<c.len1; sum+=100) {
//				pointsOut[pointsOut.length-1].straight= true;
//				let len= c.len1-sum>=100?100:c.len1-sum;
//				p1.add(dir.clone().multiplyScalar(len));
				pointsOut.push({
					position: p1.clone(),
					direction: dir.clone()
				});
//				console.log("add el1 "+p1.x+" "+p1.y+" "+
//				  dir.x+" "+dir.y);
			}
		}
		if (c.radius > 0) {
			let perp= new THREE.Vector2(-dir.y,dir.x);
			let m= Math.ceil(Math.abs(c.angle/10)*180/Math.PI);
			let angle= c.angle/m;
			let t= Math.abs(c.radius*Math.tan(angle/2));
			let h= 0;
			let cs= 1;
			let sn= 0;
			for (let j=0; j<m; j++) {
				p1.add(dir.clone().multiplyScalar(t*cs));
				p1.add(perp.clone().multiplyScalar(t*sn));
				h+= angle;
				cs= Math.cos(h);
				sn= Math.sin(h);
				p1.add(dir.clone().multiplyScalar(t*cs));
				p1.add(perp.clone().multiplyScalar(t*sn));
				pointsOut.push({
					position: p1.clone(),
					direction: new THREE.Vector2(
					  dir.x*cs - dir.y*sn,
					  dir.y*cs + dir.x*sn)
				});
//				console.log("add ec "+p1.x+" "+p1.y+" "+
//				  (dir.x*cs-dir.y*sn)+" "+
//				  (dir.y*cs+dir.x*sn));
			}
			dir= new THREE.Vector2(dir.x*cs - dir.y*sn,
			  dir.y*cs + dir.x*sn);
		}
		if (c.len2 > 0) {
			let m= Math.ceil(c.len2/100);
			for (let j=0; j<m; j++) {
				pointsOut[pointsOut.length-1].straight= true;
				p1.add(dir.clone().multiplyScalar(c.len2/m));
				pointsOut.push({
					position: p1.clone(),
					direction: dir.clone()
				});
//				console.log("add el2 "+p1.x+" "+p1.y+" "+
//				  dir.x+" "+dir.y);
			}
		}
		if (pointsIn[i+1].controlPoint)
			pointsOut[pointsOut.length-1].controlPoint=
			  pointsIn[i+1].controlPoint;
	}
	return pointsOut;
}

//	Creates a list of points along the track used is displays.
//	Adds a point for at least each degree of turn.
let makeTrackPoints= function(points,curves)
{
	let tPoints= [];
	if (points.length == 0)
		return tPoints;
	for (let i=0; i<points.length-1; i++) {
		let p= points[i];
		p.trackPoint= tPoints.length + (i==0 ? 0 : -1);
		if (p.controlPoint)
			p.controlPoint.trackPoint= p.trackPoint;
		let p1= p.position.clone();
		let prev= p1.clone();
		if (i == 0)
			tPoints.push(prev);
		let dir= p.direction;
		let c= curves[i];
		if (c.len1 > .01) {
			p1.add(dir.clone().multiplyScalar(c.len1));
			let p= p1.clone();
			tPoints.push(p);
			prev.straight= c.bad ? 2 : 1;
			prev= p;
		}
		if (c.radius > 0) {
			let perp= new THREE.Vector2(-dir.y,dir.x);
			let m= Math.ceil(Math.abs(c.angle)*180/Math.PI/2);
			let angle= c.angle/m;
			let t= Math.abs(c.radius*Math.tan(angle/2));
			if (t < .01)
				m= 0;
			let h= 0;
			let cs= 1;
			let sn= 0;
			for (let i=0; i<m; i++) {
				p1.add(dir.clone().multiplyScalar(t*cs));
				p1.add(perp.clone().multiplyScalar(t*sn));
				h+= angle;
				cs= Math.cos(h);
				sn= Math.sin(h);
				p1.add(dir.clone().multiplyScalar(t*cs));
				p1.add(perp.clone().multiplyScalar(t*sn));
				let p= p1.clone();
				tPoints.push(p);
				prev.straight= 0;
				prev= p;
			}
		}
		if (c.len2 > .01) {
			let p2= points[i+1].position.clone();
			let dir= points[i+1].direction;
			p2.sub(dir.clone().multiplyScalar(c.len2));
			tPoints.push(p2);
			prev.straight= c.bad ? 2 : 1;
			prev= p2;
		}
	}
	let p= points[points.length-1];
	p.trackPoint= tPoints.length;
	if (p.controlPoint)
		p.controlPoint.trackPoint= tPoints.length;
	tPoints.push(p.position.clone());
	return tPoints;
}

//	Calculates the direction of track at each control point.
//	If the direction is not constrained, it will be the sum of the
//	direction from the previous point and to the next point.
//	Special handling for tracks that end on curves.
let calcDirection= function(track)
{
	let prevStraight= false;
	let controlPoints= track.controlPoints;
	if (controlPoints.length == 1) {
		let cp= controlPoints[0];
		if (!cp.forcedDirection)
			cp.direction= new THREE.Vector3(1,0,0);
		return;
	}
	for (let i=0; i<controlPoints.length; i++) {
		let cp= controlPoints[i];
		if (cp.sw || (cp.forcedDirection && !prevStraight)) {
			prevStraight= cp.straight;
			continue;
		}
		cp.direction= new THREE.Vector3(0,0,0);
		if (i > 0 && !cp.straight)
			cp.direction.add(cp.position.clone().sub(
			  controlPoints[i-1].position).normalize());
		if (i < controlPoints.length-1 &&
		  (cp.straight || !prevStraight))
			cp.direction.add(controlPoints[i+1].position.clone().
			  sub(cp.position).normalize());
		cp.direction.normalize();
		prevStraight= cp.straight;
	}
	let n= controlPoints.length;
	if (n>2 && !controlPoints[0].switch &&
	  !controlPoints[0].straight && !controlPoints[0].forcedDirection) {
		let p0= controlPoints[0];
		let p1= controlPoints[1];
		let d0= new THREE.Vector2(p0.direction.x,p0.direction.y);
		let d1= new THREE.Vector2(p1.direction.x,p1.direction.y);
		let angle= Math.acos(d0.dot(d1));
		if (d0.cross(d1) > 0)
			angle= -angle;
		d0.rotateAround(new THREE.Vector2(0,0),angle);
		p0.direction.x= d0.x;
		p0.direction.y= d0.y;
	}
	if (n>2 && !controlPoints[n-1].sw &&
	  !controlPoints[n-2].straight && !controlPoints[n-1].forcedDirection) {
		let p1= controlPoints[n-2];
		let p2= controlPoints[n-1];
		let d1= new THREE.Vector2(p1.direction.x,p1.direction.y);
		let d2= new THREE.Vector2(p2.direction.x,p2.direction.y);
		let angle= Math.acos(d2.dot(d1));
		if (d2.cross(d1) > 0)
			angle= -angle;
		d2.rotateAround(new THREE.Vector2(0,0),angle);
		p2.direction.x= d2.x;
		p2.direction.y= d2.y;
	}
}

//	Adds a control point to the selected track at the specified location.
//	The point is inserted before or after the selected control point.
//	Creates a new track if nothing is selected.
let addControlPoint= function(x,y)
{
	if (!selected)
		selectedTrack= addTrack();
	let controlPoints= selectedTrack.controlPoints;
	let z= getElevation(x,y,true);
	if (z <= 0)
		z= selected ? selected.position.z : 0;
	let cp= { position: new THREE.Vector3(x,y,z),
	  endNode: findEndNode(x,y) };
	if (cp.endNode) {
		cp.position.x= cp.endNode.u;
		cp.position.y= cp.endNode.v;
		cp.position.z= cp.endNode.y;
		findTrackDirection(cp.endNode);
		cp.direction= cp.endNode.dir.clone();
		cp.forcedDirection= true;
	}
	if (!selected) {
		controlPoints.push(cp);
		cp.direction= new THREE.Vector3(1,0,0);
		cp.forcedDirection= true;
	} else {
		let i= controlPoints.indexOf(selected);
		if (selected.sw && i==0) {
			controlPoints.splice(i+1,0,cp);
		} else if (selected.sw) {
			controlPoints.splice(i,0,cp);
		} else if (!selected.direction) {
			controlPoints.push(cp);
		} else {
			let dp= cp.position.clone().sub(selected.position);
			let dot= dp.dot(selected.direction);
			if (i==0 && dot<0) {
				controlPoints.unshift(cp);
			} else if (i==controlPoints.length-1 && dot>0) {
				controlPoints.push(cp);
				if (cp.endNode)
					cp.direction.negate();
			} else if (dot < 0) {
				controlPoints.splice(i,0,cp);
			} else {
				controlPoints.splice(i+1,0,cp);
			}
		}
	}
	return cp;
}

//	searches for a TDB End Node at the specified coordinates.
let findEndNode= function(x,y)
{
	if (!addToTrackDB || !trackDB)
		return null;
	let best= null;
	let bestd= 40;
	for (let i=0; addToTrackDB && trackDB && i<trackDB.nodes.length; i++) {
		let node= trackDB.nodes[i];
		if (!node)
			continue;
		if (node.pins.length == 1) {
			let dx= x-node.u;
			let dy= y-node.v;
			let d= dx*dx+dy*dy;
			if (d < bestd) {
				bestd= d;
				best= node;
			}
		}
	}
	return best;
}

//	Implements the Edit menu Delete function.
//	Removes the selected control point from its track.
//	Also remove the associated switch if any.
let deleteControlPoint= function()
{
	if (!selected)
		return;
	let controlPoints= selectedTrack.controlPoints;
	let i= controlPoints.indexOf(selected);
	controlPoints.splice(i,1);
	if (selected.sw) {
		let sw= selected.sw;
		for (let j=0; j<sw.points.length; j++)
			sw.points[j].sw= null;
		let j= switches.indexOf(sw);
		switches.splice(j,1);
	}
	if (controlPoints.length == 0) {
		let i= tracks.indexOf(selectedTrack);
		tracks.splice(i,1);
	}
	selected= null;
	calcTrack();
	renderCanvas();
}

//	Implements the Edit menu Straight function.
//	Marks the selected control point so the track between it and the
//	next will be straight.
let makeStraight= function()
{
	if (!selected)
		return;
	selected.straight= true;
	selected.forcedDirection= false;
	calcTrack();
	renderCanvas();
}

//	Implements the Edit menu Curve function.
//	Marks the selected control point so the track between it and the
//	next can be curved.
let makeCurve= function()
{
	if (!selected)
		return;
	selected.straight= false;
	calcTrack();
	renderCanvas();
}

//	Implements the Edit menu Align function.
//	Moves the selected control point to fix alignment problems as much
//	as possible.
//	May also rotate a switch if needed.
let alignStraight= function()
{
	if (!selected)
		return;
	let controlPoints= selectedTrack.controlPoints;
	let i= controlPoints.indexOf(selected);
//	console.log("align "+i+" "+controlPoints.length);
	if (selected.sw && alignSwitch()) {
		calcTrack();
		renderCanvas();
	} else if (i>0 && controlPoints[i].straight &&
	  controlPoints[i-1].forcedDirection) {
		moveToLine(selected,controlPoints[i-1]);
		calcTrack();
		renderCanvas();
	} else if (i<controlPoints.length-1 && controlPoints[i].straight &&
	  controlPoints[i+1].forcedDirection) {
		moveToLine(selected,controlPoints[i+1]);
		calcTrack();
		renderCanvas();
	} else if (selected.straight && i>0 && controlPoints[i-1].straight &&
	  i<controlPoints.length-1) {
		moveToLine(selected,controlPoints[i-1],controlPoints[i+1]);
		calcTrack();
		renderCanvas();
	} else if (selected.straight && i<controlPoints.length-2 &&
	  controlPoints[i+1].straight) {
		moveToLine(selected,controlPoints[i+1],controlPoints[i+2]);
		calcTrack();
		renderCanvas();
	} else if (i>1 && controlPoints[i-2].straight &&
	  controlPoints[i-1].straight) {
		moveToLine(selected,controlPoints[i-2],controlPoints[i-1]);
		calcTrack();
		renderCanvas();
	}
}

//	Moves point p to be on the line between points p1 and p2.
//	Uses the p1 direction if p2 is not defined.
//	If the is a switch associated with p, it will be rotated if needed.
let moveToLine= function(p,p1,p2)
{
	let dx= p2 ? p2.position.x-p1.position.x : p1.direction.x;
	let dy= p2 ? p2.position.y-p1.position.y : p1.direction.y;
	let d= dx*dx + dy*dy;
	let n= dx*(p.position.x-p1.position.x) +
	  dy*(p.position.y-p1.position.y);
	if (d == 0)
		d= 2*n;
	p.position.x= p1.position.x + dx*n/d;
	p.position.y= p1.position.y + dy*n/d;
//	console.log("align "+dx+" "+dy+" "+n+" "+d);
	if (p.sw) {
		let p0= p.sw.points[0];
		let p1= p.sw.points[1];
		let dot= (p1.position.x-p0.position.x)*dx +
		  (p1.position.y-p0.position.y)*dy;
		p.sw.angle= dot>0 ?
		  Math.atan2(dy,dx) : Math.atan2(-dy,-dx);
		let i= p.sw.points.indexOf(p);
		if (i > 0) {
			p.sw.angle-= p.sw.angles[i-1];
			let cos= Math.cos(p.sw.angle);
			let sin= Math.sin(p.sw.angle);
			let csg= Math.cos(p.sw.grade);
			let o= p.sw.offsets[i-1];
			p0.position.x= p.position.x - cos*o.x*csg + sin*o.y;
			p0.position.y= p.position.y - cos*o.y - sin*o.x*csg;
		}
//		console.log("alignsw "+p.sw.angle+" "+i+" "+dx+" "+dy+" "+
//		  dot);
	}
}

//	Aligns the switch associated with the selected point depending
//	on which switch points are connected to straights.
let alignSwitch= function()
{
	if (!selected || !selected.sw)
		return;
	let sw= selected.sw;
	// returns true if the switch end point is connected to a straight
	let isStraight= function(index) {
		let cp= sw.points[index];
		let track= findTrack(cp);
		let controlPoints= track.controlPoints;
		let n= controlPoints.length;
		if (n < 2)
			return false;
		if (cp == controlPoints[0])
			return cp.straight;
		return controlPoints[n-2].straight;
	}
	// returns the control point adjacent to a switch end point
	let farPoint= function(index) {
		let cp= sw.points[index];
		let track= findTrack(cp);
		let controlPoints= track.controlPoints;
		let n= controlPoints.length;
//		console.log("far "+index+" "+(cp==controlPoints[0])+" "+n);
		if (cp == controlPoints[0])
			return controlPoints[1];
		else
			return controlPoints[n-2];
	}
	let alignTwoStraights= function(index) {
		let cp= sw.points[index];
		let track= findTrack(cp);
		let controlPoints= track.controlPoints;
		let n= controlPoints.length;
		if (n < 3)
			return false;
		if (cp == controlPoints[0]) {
			let fp1= controlPoints[1];
			let fp2= controlPoints[2];
			if (cp.straight && fp1.straight) {
				moveToLine(cp,fp1,fp2);
				return true;
			}
		} else {
			let fp1= controlPoints[n-2];
			let fp2= controlPoints[n-3];
			if (fp1.straight && fp2.straight) {
				moveToLine(cp,fp1,fp2);
				return true;
			}
		}
		return false;
	}
	// moves the switch to the intersection of the lines from fp0 and fp1.
	// angle is the angle of the switch relative to fp0 line.
	// offsets is point offset relative to fp0.
	let moveToInt= function(fp0,fp1,angle,offsets,pointAngle) {
		let dp= new THREE.Vector2(
		  sw.points[0].position.x-fp0.position.x,
		  sw.points[0].position.y-fp0.position.y);
		let d1= new THREE.Vector2(fp0.direction.x,fp0.direction.y);
		let d2= new THREE.Vector2(fp1.direction.x,fp1.direction.y);
		let cs= Math.cos(angle);
		let sn= Math.sin(angle);
//		console.log("movetoint "+d1.x+" "+d1.y+" "+dp.x+" "+dp.y+" "+
//		  d1.dot(dp)+" "+angle+" "+pointAngle);
		if (fp0.forcedDirection) {
			if (d1.dot(dp) < 0)
				d1.negate();
			d1.normalize();
			d2= new THREE.Vector2(cs*d1.x-sn*d1.y,cs*d1.y+sn*d1.x);
			d2.normalize();
		} else {
			if (d2.dot(dp) < 0)
				d2.negate();
			d2.normalize();
			d1= new THREE.Vector2(cs*d2.x+sn*d2.y,cs*d2.y-sn*d2.x);
			d1.normalize();
		}
//		console.log("movetoint "+d1.x+" "+d1.y+" "+
//		  angle+" "+d2.x+" "+d2.y);
		let p1= new THREE.Vector2(fp0.position.x,fp0.position.y);
		let p2= new THREE.Vector2(fp1.position.x,fp1.position.y);
		let pi= segSegInt(p1,p1.clone().add(d1),p2,p2.clone().add(d2));
		let p= new THREE.Vector2(pi.x,pi.y);
		cs= Math.cos(angle);
		sn= Math.sin(angle);
		let offset= offsets.x-offsets.y*cs/sn;
		if (pointAngle) {
			let cs= Math.cos(-pointAngle);
			let sn= Math.sin(-pointAngle);
			d1= new THREE.Vector2(cs*d1.x-sn*d1.y,cs*d1.y+sn*d1.x);
			d1.normalize();
		}
		p.sub(d1.multiplyScalar(offset));
		sw.points[0].position.x= p.x;
		sw.points[0].position.y= p.y;
		sw.angle= Math.atan2(d1.y,d1.x);
//		console.log("pi "+pi.x+" "+pi.y+" "+offset+" "+sw.angle);
	}
	if (isStraight(0)) {
		let fp0= farPoint(0);
		for (let i=0; i<2; i++) {
			if (sw.angles[i]!=0 && isStraight(i+1)) {
				let fpr= farPoint(i+1);
				if (fp0.forcedDirection ||
				  fpr.forcedDirection) {
					moveToInt(fp0,fpr,sw.angles[i],
					  sw.offsets[i],0);
					return 1;
				}
			}
		}
		if (fp0.forcedDirection) {
			moveToLine(sw.points[0],fp0);
			return 1;
		} else {
			for (let i=0; i<2; i++) {
				if (sw.angles[i]==0 && isStraight(i+1)) {
					let fpn= farPoint(i+1);
					moveToLine(sw.points[0],fp0,fpn);
					return 1;
				}
			}
		}
	} else if (isStraight(1) && isStraight(2)) {
		let fp1= farPoint(1);
		let fp2= farPoint(2);
		if (fp1.forcedDirection && sw.angles[0]==0) {
			moveToInt(fp1,fp2,sw.angles[1],sw.offsets[1],
			  Math.PI);
			return 1;
		} else if (fp2.forcedDirection && sw.angles[1]==0) {
			moveToInt(fp2,fp1,sw.angles[0],sw.offsets[0],
			  Math.PI);
			return 1;
		} else if (fp1.forcedDirection) {
			moveToInt(fp1,fp2,sw.angles[1],
			  sw.offsets[1],sw.angles[0]);
			return 1;
		} else if (fp2.forcedDirection) {
			moveToInt(fp2,fp1,sw.angles[0],sw.offsets[0],
			  sw.angles[1]);
			return 1;
		}
	} else if (isStraight(1)) {
		if (alignTwoStraights(1))
			return 1;
//		moveToLine(p1,fp1);
//		return 1;
	} else if (isStraight(2)) {
		if (alignTwoStraights(2))
			return 1;
//		moveToLine(sw.points[2],fp2);
//		return 1;
	}
	return 0;
}

//	Implements the Edit menu Calc.Elev. function.
//	Sets the selected control point so its elevation will be calculated.
let setCalcElev= function()
{
	if (!selected)
		return;
	selected.calcElevation= true;
	calcTrack();
	renderCanvas();
}

//	Implements the Edit menu Bridge function.
//	Toggles the selected control point has bridge value.
let toggleBridge= function()
{
	if (!selected)
		return;
	if (selected.bridge)
		selected.bridge= false;
	else
		selected.bridge= document.getElementById("bridgetype").value;
	calcTrack();
	renderCanvas();
}

//	Implements the Edit menu Overpass function.
//	Toggles the selected control point has overpass value.
let toggleOverpass= function()
{
	if (!selected)
		return;
	if (selected.overpass)
		selected.overpass= false;
	else
		selected.overpass= true;
	calcTrack();
	renderCanvas();
}

//	Implements the Edit menu No Cut function.
//	Toggles the selected control point has noCut value.
let toggleNoCut= function()
{
	let tx= centerTX + Math.round(centerU/2048);
	let tz= centerTZ + Math.round(centerV/2048);
	let tile= findTile(tx,tz);
	let cu= 2048*(tx-centerTX);
	let cv= 2048*(tz-centerTZ);
	let pi= Math.floor((1024-centerV+cv)/128);
	let pj= Math.floor((centerU+1024-cu)/128);
	if (!tile.noCut)
		tile.noCut= [];
	let saveNoCut= function() {
		for (let i=0; i<tile.noCut.length; i++) {
			let nc= tile.noCut[i];
			if (nc.i==pi && nc.j==pj) {
				nc.value= !nc.value;
				return;
			}
		}
		tile.noCut.push({ i:pi, j:pj, value:true });
	}
	saveNoCut();
	renderCanvas();
}

//	Implements the Edit menu Offset function.
//	Moves the selected control point so that it is atleast 4.985 meters
//	from other tracks.
let moveAway= function()
{
//	let dist= 4.985;
	let dist= parseFloat(document.getElementById("trackspacing").value);
	if (!selected)
		return;
	let p= new THREE.Vector2(selected.position.x,selected.position.y);
//	console.log("moveaway "+p.x+" "+p.y+" "+dist);
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track == selectedTrack)
			continue;
		let points= track.trackPoints;
		for (let j=0; j<points.length-1; j++) {
			movePointAway(p,dist,points[j],points[j+1]);
		}
	}
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		if (selected == sw.points[0])
			continue;
		movePointAway(p,dist,sw.points[0].position,
		  sw.points[1].position);
		movePointAway(p,dist,sw.points[0].position,
		  sw.points[2].position);
	}
//	console.log("moveaway "+p.x+" "+p.y);
	if (selected.sw && selected.sw.points[0]!=selected) {
		let p0= selected.sw.points[0];
		p0.position.x+= p.x-selected.x;
		p0.position.y+= p.y-selected.y;
	} else {
		selected.position.x= p.x;
		selected.position.y= p.y;
	}
	calcTrack();
	renderCanvas();
}

//	Moves point p so that it is dist meters away from the line between
//	p1 and p2.
let movePointAway= function(p,dist,p1,p2)
{
	let xy= lineSegNearest(p.x,p.y,p1.x,p1.y,p2.x,p2.y);
	let dx= p.x-xy.x;
	let dy= p.y-xy.y;
	let d= Math.sqrt(dx*dx+dy*dy);
	if (d<dist && d>0) {
//		console.log("move "+d+" "+p1.x+" "+p1.y+" "+p2.x+" "+p2.y+" "+
//		  dx+" "+dy+" "+d+" "+dist+" "+(dist/d));
		p.x+= dx*(dist-d)/d;
		p.y+= dy*(dist-d)/d;
//		console.log("dist "+p.x+" "+p.y+" "+
//		  Math.sqrt(lineSegDistSq(p.x,p.y,p1.x,p1.y,p2.x,p2.y)));
	}
}

//	returns the terrain elevation given internal u/v coordinates.
let getElevation= function(u,v,orig)
{
	let tx= centerTX + Math.round(u/2048);
	let tz= centerTZ + Math.round(v/2048);
	let x= u - 2048*(tx-centerTX);
	let z= v - 2048*(tz-centerTZ);
//	console.log("ge "+tx+" "+tz+" "+x+" "+z);
	return getTileElevation(tx,tz,x,z,orig);
}

//	sets the terrain elevation given internal u/v coordinates.
let setElevation= function(u,v,elev)
{
	let tx= centerTX + Math.round(u/2048);
	let tz= centerTZ + Math.round(v/2048);
	let x= u - 2048*(tx-centerTX);
	let z= v - 2048*(tz-centerTZ);
	setTileElevation(tx,tz,x,z,elev);
}

//	Calculates the distance of control points down the track.
let calcDistance= function(track,points,useCurves)
{
	let trackPoints= track.trackPoints;
	let curves= track.flatCurves;
	let dist= 0;
	let j= 0;
	let bridge= false;
	for (let i=0; i<points.length; i++) {
		let p= points[i];
		if (useCurves && i>0) {
			let c= curves[i-1];
			dist+= c.len1+c.len2;
			if (c.radius)
				dist+= c.radius*Math.abs(c.angle);
		} else if (!useCurves) {
			for (; j<p.trackPoint; j++) {
				dist+= trackPoints[j].distanceTo(
				  trackPoints[j+1]);
//				if (track == selectedTrack)
//					console.log(" "+j+" "+dist);
			}
		}
		p.distance= dist;
		if (p.controlPoint) {
//			if (track == selectedTrack)
//				console.log("dist "+i+" "+p.distance+" "+j+" "+
//				  p.controlPoint.distance);
			p.controlPoint.distance= dist;
			bridge= p.controlPoint.bridge;
		}
		p.bridge= bridge;
	}
//	if (track == selectedTrack)
//		console.log("calcdist "+tracks.indexOf(track)+" "+
//		  useCurves+" "+dist);
}

//	Creates an array of ground elevations for the specified track.
//	These are displayed in the profile.
let makeGroundPoints= function(track,orig)
{
	let trackPoints= track.trackPoints;
	track.groundPoints= [];
	if (trackPoints.length < 2)
		return;
	let p0= trackPoints[0];
	let dist0= 0;
	track.groundPoints.push({ dist: 0,
	  elev: getElevation(p0.x,p0.y,orig) });
	let dist= 0;
	let step= 8;
	for (let i=1; i<trackPoints.length; i++) {
		let p1= trackPoints[i];
		let d= p1.distanceTo(p0);
		let perp= new THREE.Vector2(p1.y-p0.y,p1.x-p0.x);
		perp.normalize();
		let dx= 5*perp.x;
		let dy= 5*perp.y;
		while (dist+step <= dist0+d) {
			dist+= step;
			let a= (dist-dist0)/d;
			let x= (1-a)*p0.x + a*p1.x;
			let y= (1-a)*p0.y + a*p1.y;
			track.groundPoints.push({
				dist: dist,
				elev: getElevation(x,y,orig),
				elev1: getElevation(x+dx,y+dy,orig),
				elev2: getElevation(x-dx,y-dy,orig)
			});
		}
		dist0+= d;
		p0= p1;
	}
	track.groundPoints.push({ dist: dist0,
	  elev: getElevation(p0.x,p0.y,orig) });
}

//	Displays the selected track radius, angle and straight length
//	information in two tables.
let printTrack= function(curves,rpCurves)
{
	let s= "<br>Track Type: "+selectedTrack.type+
	  "<br>Flat Track "+
	  "<table><tr><th>N</th><th>Straight</th><th>Angle</th>"+
	  "<th>Radius</th><th>Degrees</th><th>Straight</th>"+
//	  "<th>Speed</th><th>Spiral Angle</th><th>Spiral Length</th>"+
//	  "<th>Radius</th><th>Degrees</th>"+
	  "</tr>";
	for (let i=0; i<curves.length; i++) {
		let c= curves[i];
		s+= "<tr><td>"+(i+1).toFixed(0)+"</td><td>";
		if (c.len1)
			s+= c.len1.toFixed(3);
		s+= "</td><td>";
		if (c.angle)
			s+= (c.angle*180/Math.PI).toFixed(1);
		s+= "</td><td>";
		if (c.radius)
			s+= c.radius.toFixed(3);
		s+= "</td><td>";
		if (c.radius)
			s+= radius2deg(c.radius).toFixed(1);
		s+= "</td><td>";
		if (c.len2)
			s+= c.len2.toFixed(3);
		if (c.bad)
			s+= "</td><td>bad "+c.bad;
		if (false && c.radius) {
			let sp= calcSpiral(c);
			s+= "</td><td>";
			s+= sp.speed.toFixed(1);
			s+= "</td><td>";
			s+= (sp.sc*180/Math.PI).toFixed(1);
			s+= "</td><td>";
			s+= sp.lc.toFixed(3);
			s+= "</td><td>";
			s+= sp.radius.toFixed(3);
			s+= "</td><td>";
			s+= radius2deg(sp.radius).toFixed(1);
		}
		if (c.controlPoint && c.controlPoint===selected)
			s+= "</td><td>selected";
		s+= "</td></tr>";
	}
	s+= "</table>";
	s+= "<br>Dynamic Track";
	s+= "<table><tr><th>N</th><th>Straight</th><th>Angle</th>"+
	  "<th>Radius</th><th>Degrees</th><th>Straight</th>"+
	  "<th>Elevation</th></tr>";
	for (let i=0; i<rpCurves.length; i++) {
		let c= rpCurves[i];
		s+= "<tr><td>"+(i+1).toFixed(0)+"</td><td>";
		if (c.len1)
			s+= c.len1.toFixed(3);
		s+= "</td><td>";
		if (c.angle)
			s+= (c.angle*180/Math.PI).toFixed(1);
		s+= "</td><td>";
		if (c.radius)
			s+= c.radius.toFixed(3);
		s+= "</td><td>";
		if (c.radius)
			s+= radius2deg(c.radius).toFixed(1);
		s+= "</td><td>";
		if (c.len2)
			s+= c.len2.toFixed(3);
		s+= "</td><td>";
		s+= (c.elevation*180/Math.PI).toFixed(1);
		if (c.bad)
			s+= "</td><td>bad "+c.bad;
		s+= "</td></tr>";
	}
	s+= "</table>";
	s+= "<p><table>";
	for (let i=0; i<selectedTrack.controlPoints.length; i++) {
		let cp= selectedTrack.controlPoints[i];
		s+= "<tr><td>"+i+"</td><td>"+cp.distance+"</td><td>"+
		  cp.trackGrade+"</td><td>"+cp.gradeChangeDist+"</td>";
		if (cp == selected)
			s+= "<td>selected</td>";
		s+= "</tr>";
	}
	s+= "</table>";
	document.getElementById('results').innerHTML= s;
}

//	Calculates grades at and between control point for the given track.
//	cpGrade is the grade at the control point and trackGrade is the grade
//	of track between points.
let calcGrades= function(track)
{
	let controlPoints= track.controlPoints;
	if (controlPoints.length<2)
		return;
	let gradeChangeRate= .2/100/(.3048*100);// .2% per 100ft station
	// returns the distance needed for change grade at the normal rate
	let gradeChangeDist= function(g1,g2) {
		let r= gradeChangeRate;
		if (g2 > g1)
			r*= .5;// sag 1/2 of crest
		return .5*Math.abs(g2-g1)/r;
	}
	// calculates the grade between cp1 and cp2 allowing up to 1/3
	// of the distance to be used for grade changes
	let grade= function(cp1,cp2) {
		let dd= cp2.distance - cp1.distance;
		if (cp1.gradeChangeDist > .33*dd)
			cp1.gradeChangeDist= .33*dd;
		if (cp2.gradeChangeDist > .33*dd)
			cp2.gradeChangeDist= .33*dd;
		let dz= cp2.position.z - cp1.position.z -
		  .5*cp1.gradeChangeDist*cp1.cpGrade -
		  .5*cp2.gradeChangeDist*cp2.cpGrade;
		return dz /
		  (dd - .5*cp1.gradeChangeDist - .5*cp2.gradeChangeDist);
	}
	for (let i=0; i<controlPoints.length; i++) {
		let cp= controlPoints[i];
		cp.gradeChangeDist= 0;
		if (!cp.sw)
			cp.cpGrade= 0;
	}
	for (let i=0; i<controlPoints.length-1; i++) {
		let cp1= controlPoints[i];
		let cp2= controlPoints[i+1];
		cp1.trackGrade= grade(cp1,cp2);
		cp2.trackGrade= cp1.trackGrade;
	}
	for (let iter=0; iter<1; iter++) {
		let cp= controlPoints[0];
		if (cp.sw)
			cp.gradeChangeDist=
			  gradeChangeDist(cp.cpGrade,cp.trackGrade);
		else
			cp.cpGrade= cp.trackGrade;
		cp= controlPoints[controlPoints.length-1];
		if (cp.sw)
			cp.gradeChangeDist=
			  gradeChangeDist(cp.trackGrade,cp.cpGrade);
		else
			cp.cpGrade= cp.trackGrade;
		for (let i=1; i<controlPoints.length-1; i++) {
			let cp1= controlPoints[i-1];
			let cp2= controlPoints[i];
			cp2.gradeChangeDist= gradeChangeDist(
			  cp1.trackGrade,cp2.trackGrade);
			cp2.cpGrade= .5*(cp1.trackGrade+cp2.trackGrade);
//			console.log("gcd "+i+" "+cp2.gradeChangeDist+" "+
//			  (cp2.trackGrade-cp1.trackGrade));
		}
		for (let i=0; i<controlPoints.length-1; i++) {
			let cp1= controlPoints[i];
			let cp2= controlPoints[i+1];
			cp1.trackGrade= grade(cp1,cp2);
			cp2.trackGrade= cp1.trackGrade;
		}
	}
//	for (let i=0; i<controlPoints.length; i++) {
//		let cp= controlPoints[i];
//		console.log("grade "+i+" "+cp.cpGrade.toFixed(4)+" "+
//		  cp.trackGrade.toFixed(4)+" "+
//		  cp.gradeChangeDist.toFixed(3)+" "+
//		  cp.distance.toFixed(3)+" "+cp.position.z.toFixed(3));
//	}
}

//	Calculates the elevation of points added between control points.
//	tries to smooth grade changes.
let assignElevation= function(track,points)
{
	let controlPoints= track.controlPoints;
	if (controlPoints.length<2)
		return;
	let cp0= controlPoints[0];
//	console.log("cp "+0+" "+cp0.position.z+" "+cp0.gradeChangeDist+" "+
//	  cp0.cpGrade+" "+cp0.trackGrade);
	let j= 0;
	for (let i=1; i<controlPoints.length; i++) {
		let cp1= controlPoints[i];
		let offset0=
		  -.5*cp0.gradeChangeDist*(cp0.trackGrade-cp0.cpGrade);
		let offset1=
		  -.5*cp1.gradeChangeDist*(cp1.cpGrade-cp0.trackGrade);
//		console.log("cp "+i+" "+cp1.position.z+" "+
//		  cp1.gradeChangeDist+" "+
//		  cp1.cpGrade+" "+cp1.trackGrade+" "+offset0+" "+offset1+" "+
//		  (cp1.position.z+offset1-cp0.position.z-offset0)/
//		  (cp1.distance-cp0.distance));
		for (; j<points.length; j++) {
			let p= points[j];
			let a= (p.distance-cp0.distance) /
			  (cp1.distance-cp0.distance);
			p.elevation= a*(cp1.position.z+offset1) +
			  (1-a)*(cp0.position.z+offset0);
			let d0= p.distance - cp0.distance;
			let d1= cp1.distance - p.distance;
			if (d0 < cp0.gradeChangeDist) {
				let x= 1 - d0/cp0.gradeChangeDist;
				p.elevation-= x*x*offset0;
			} else if (d1 < cp1.gradeChangeDist) {
				let x= 1 - d1/cp1.gradeChangeDist;
				p.elevation-= x*x*offset1;
			}
//			if (track == selectedTrack)
			if (cp0 == selected)
			console.log("elev "+i+" "+j+" "+p.elevation+" "+
			  (a*cp1.position.z + (1-a)*cp0.position.z)+" "+
//			  a+" "+d0+" "+d1);
			  a+" "+p.distance+" "+p.trackPoint);
			if (p.controlPoint == cp1)
				break;
		}
		cp0= cp1;
	}
}

//	Interpolates elevation between control points cp0 and cp1
//	using control point and track grades.
let interpElevation= function(cp0,cp1,a)
{
	let offset0= -.5*cp0.gradeChangeDist*(cp0.trackGrade-cp0.cpGrade);
	let offset1= -.5*cp1.gradeChangeDist*(cp1.cpGrade-cp0.trackGrade);
	let elevation= a*(cp1.position.z+offset1) +
	  (1-a)*(cp0.position.z+offset0);
	let d= a*cp1.distance + (1-a)*cp0.distance;
	let d0= d - cp0.distance;
	let d1= cp1.distance - d;
//	console.log("interp "+a+" "+elevation+" "+d+" "+d0+" "+d1);
	if (d0 < cp0.gradeChangeDist) {
		let x= 1 - d0/cp0.gradeChangeDist;
		elevation-= x*x*offset0;
	} else if (d1 < cp1.gradeChangeDist) {
		let x= 1 - d1/cp1.gradeChangeDist;
		elevation-= x*x*offset1;
	}
	return elevation;
}

let fitFixedShapes= function(track,curves)
{
	let controlPoints= track.controlPoints;
	if (controlPoints.length<2)
		return;
	let calcElevDist= function(cp0,cp1,dist0,elev0,len) {
//		console.log("ced "+cp0.distance+" "+cp1.distance+" "+dist0+" "+
//		  elev0+" "+len);
		let e= elev0;
		let d= len;
		for (let i=0; i<10; i++) {
			let a= (dist0+d-cp0.distance)/
			  (cp1.distance-cp0.distance);
			e= interpElevation(cp0,cp1,a);
			let de= e-elev0;
			d= Math.sqrt(len*len-de*de);
//			console.log("ced "+a+" "+e+" "+de+" "+d);
			if (Math.abs(len-d) < .005)
				break;
		}
		return { elev: e, dist: dist0+d };
	}
	let cp0= controlPoints[0];
//	console.log("cp0 "+0+" "+cp0.position.z+" "+cp0.gradeChangeDist+" "+
//	  cp0.cpGrade+" "+cp0.trackGrade+" "+cp0.distance);
	let dist= 0;
	let j= 0;
	for (let i=1; i<controlPoints.length; i++) {
		let cp1= controlPoints[i];
//		console.log("cp1 "+0+" "+cp1.position.z+" "+
//		  cp1.gradeChangeDist+" "+
//		  cp1.cpGrade+" "+cp1.trackGrade+" "+cp1.distance);
		let elev= cp0.position.z;
		for (; dist<cp1.distance && j<curves.length; j++) {
			let c= curves[j];
			if (c.bad) {
				dist+= c.len1+c.len2;
				continue;
			}
			if (c.len1 > 0) {
//				if (c.len1 > 100) {
//				let ed= calcElevDist(cp0,cp1,dist,elev,100);
//				console.log("ed "+(ed.dist-dist)+" "+
//				  (ed.elev-elev)+" "+dist+" "+ed.dist+" "+
//				  elev+" "+ed.elev+" "+c.len1);
//				}
				dist+= c.len1;
			}
			if (c.radius > 0) {
				dist+= c.radius*Math.abs(c.angle);
			}
			if (c.len2 > 0) {
				dist+= c.len2;
			}
		}
		cp0= cp1;
	}
}

//	Calculates curve radius and straight length for rotated track shapes.
let calcRotPlaneCurves= function(points)
{
	let curves= [];
	for (let i=0; i<points.length-1; i++) {
		let p1= points[i];
		let p2= points[i+1];
		let dist1= Math.sqrt(lineDistSq(p2.position.x,p2.position.y,
		  p1.position.x,p1.position.y,
		  p1.position.x-p1.direction.y,p1.position.y+p1.direction.x));
		let dist2= Math.sqrt(lineDistSq(p2.position.x,p2.position.y,
		  p1.position.x,p1.position.y,
		  p1.position.x+p1.direction.x,p1.position.y+p1.direction.y));
		let de= p2.elevation-p1.elevation;
//		console.log("dist "+dist1+" "+dist2+" "+de);
		let dot= p1.direction.dot(p2.direction);
		let cross= p1.direction.cross(p2.direction);
		let sign= cross>0 ? 1 : -1;
//		console.log("dot "+dot+" "+cross+" "+sign);
		let angle= dist1>0 ? Math.asin((de)/dist1) : 0;
//		console.log("angle "+angle+" "+(angle*180/Math.PI));
		let c= calcCurve({ x:0, y:0 },
		  { x:Math.sqrt(dist1*dist1+de*de), y:sign*dist2 },
		  { x:1, y:0 }, { x:dot, y:sign*Math.sqrt(1-dot*dot) });
		c.elevation= angle;
		curves.push(c);
//		console.log("curve "+i+" "+c.angle+" "+c.radius+" "+
//		  c.len1+" "+c.len2);
		p1.curve= c;
	}
	return curves;
}

//	Converts internal u/v coordinates to lat/long.
let uv2ll= function(u,v)
{
	if (projection) {
		let xy= projection.inverse({ x: u, y: v });
		return { lat: xy.y, lng: xy.x };
	} else {
		let xy= ighProj.inverse({
		  x: u + centerTX*2048 - 20015000 + 16385*2048 - 1024,
		  y: v + centerTZ*2048 + 8673000 - 16385*2048 + 3072
		});
		return { lat: xy.y, lng: xy.x };
	}
}

//	Converts lat/long to internal u/v coordinates.
let ll2uv= function(lat,lng)
{
	if (projection) {
		let xy= projection.forward({ x: lng, y: lat });
		return { u: xy.x, v: xy.y };
	} else {
		let xy= ighProj.forward({ x: lng, y: lat });
		return {
		  u: xy.x - centerTX*2048 + 20015000 - 16385*2048 + 1024,
		  v: xy.y - centerTZ*2048 - 8673000 + 16385*2048 - 3072
		};
	}
}

//	Adds a new empty track.
let addTrack= function()
{
	let track= {
		controlPoints: [],
		trackPoints: [],
		dynTrackPoints: [],
		groundPoints: [],
	};
	tracks.push(track);
//	console.log("add Track "+tracks.length);
	return track;
}

//	Reads a csv file of lat/long and creates a new track.
//	Creates and new projection if this is the first track.
let readCSV= function(filename)
{
	let csv= fs.readFileSync(filename,"ascii");
	let lines= csv.split("\n");
	if (!projection) {
		let minLat= 90;
		let maxLat= -90;
		let minLng= 180;
		let maxLng= -180;
		for (let i=0; i<lines.length; i++) {
			let fields= lines[i].split(",");
			if (fields.length < 2)
				continue;
			let lat= parseFloat(fields[0]);
			let lng= parseFloat(fields[1]);
			if (minLat > lat)
				minLat= lat;
			if (maxLat < lat)
				maxLat= lat;
			if (minLng > lng)
				minLng= lng;
			if (maxLng < lng)
				maxLng= lng;
		}
		let centerLat= .5*(minLat+maxLat);
		let centerLng= .5*(minLng+maxLng);
//		console.log("center "+centerLat+" "+centerLng);
		let xy= ighProj.forward({ x: centerLng, y: centerLat });
		centerTX=
		  Math.round((xy.x + 20015000 - 16385*2048 + 1024)/2048);
		centerTZ=
		  Math.round((xy.y - 8673000 + 16385*2048 - 3072)/2048);
		let ll= uv2ll(0,0);
//		console.log(" "+centerTX+" "+centerTZ+" "+ll.lat+" "+ll.lng);
		let k0= Math.cos(.5*(maxLng-ll.lng)*Math.PI/180);
		proj4Str= "+proj=tmerc +lat_0="+ll.lat+" +lon_0="+ll.lng+
		  " +k_0="+k0+" +x_0=0 +y_0=0";
//		console.log(projection);
		proj4= require('proj4');
		projection= proj4(proj4Str);
		xy= projection.forward({ x: ll.lng, y: ll.lat });
		ll= projection.inverse({ x: xy.x, y: xy.y });
//		console.log(" "+xy.x+" "+xy.y+" "+ll.y+" "+ll.x);
	}
	let track= addTrack();
	selectedTrack= track;
	let minU= 1e10;
	let maxU= -1e10;
	let minV= 1e10;
	let maxV= -1e10;
	for (let i=0; i<lines.length; i++) {
		let fields= lines[i].split(",");
		if (fields.length < 2)
			continue;
		let lat= parseFloat(fields[0]);
		let lng= parseFloat(fields[1]);
		let uv= ll2uv(lat,lng);
		track.controlPoints.push({
		  position: new THREE.Vector3(uv.u,uv.v,
		   getElevation(uv.u,uv.v,true))
		});
		if (minU > uv.u)
			minU= uv.u;
		if (maxU < uv.u)
			maxU= uv.u;
		if (minV > uv.v)
			minV= uv.v;
		if (maxV < uv.v)
			maxV= uv.v;
	}
	let canvas= document.getElementById("canvas");
	let sx= canvas.width/(1.2*(maxU-minU));
	let sz= canvas.height/(1.2*(maxV-minV));
	scale= sx<sz ? sx : sz;
	calcTrack();
	renderCanvas();
}

let writeCSV= function(filename)
{
	if (!selectedTrack)
		return;
	let points= selectedTrack.controlPoints;
	let out= "";
	for (let i=0; i<points.length; i++) {
		let p= points[i].position;
		let ll= uv2ll(p.x,p.y);
		out+= ll.lat.toString()+", "+ll.lng.toString()+"\n";
	}
	if (filename.indexOf(".csv") < 0)
		filename+= ".csv";
	fs.writeFileSync(filename,out);
}

//	Connects the selected track and point to another point and track hit
//	by the mouse with control down.
//	The tracks will be merged of both points are at an end of the
//	corresponding tracks.
//	Otherwise a switch is inserted.
let connectTracks= function(hitPoint,hitTrack)
{
	if (selected.sw || hitPoint.sw)
		return;
	let sPoints= selectedTrack.controlPoints;
	let hPoints= hitTrack.controlPoints;
	let sLen= sPoints.length;
	let hLen= hPoints.length;
	if (selected==sPoints[0] && hitPoint==hPoints[0]) {
		reverseTrack(hitTrack);
		selectedTrack.controlPoints= hPoints.concat(sPoints);
		removeTrack(hitTrack);
	} else if (selected==sPoints[0] && hitPoint==hPoints[hLen-1]) {
		selectedTrack.controlPoints= hPoints.concat(sPoints);
		removeTrack(hitTrack);
	} else if (selected==sPoints[0]) {
		addSwitch(hitPoint,hitTrack,selected,selectedTrack);
	} else if (selected==sPoints[sLen-1] && hitPoint==hPoints[0]) {
		selectedTrack.controlPoints= sPoints.concat(hPoints);
		removeTrack(hitTrack);
	} else if (selected==sPoints[sLen-1] && hitPoint==hPoints[hLen-1]) {
		reverseTrack(hitTrack);
		selectedTrack.controlPoints= sPoints.concat(hPoints);
		removeTrack(hitTrack);
	} else if (selected==sPoints[sLen-1]) {
		reverseTrack(selectedTrack);
		addSwitch(hitPoint,hitTrack,selected,selectedTrack);
	} else if (hitPoint==hPoints[0]) {
		addSwitch(selected,selectedTrack,hitPoint,hitTrack);
	} else if (hitPoint==hPoints[hLen-1]) {
		reverseTrack(hitTrack);
		addSwitch(selected,selectedTrack,hitPoint,hitTrack);
	}
	// else maybe add crossover
}

//	Removes the specified track from the track list.
let removeTrack= function(track)
{
	let i= tracks.indexOf(track);
	tracks.splice(i,1);
}

//	Reverses the control points on the selected track.
let reverseTrack= function(track)
{
	track.controlPoints.reverse();
	for (let i=0; i<track.controlPoints.length; i++) {
		let cp= track.controlPoints[i];
		if (i < track.controlPoints.length-1)
			cp.straight= track.controlPoints[i+1].straight;
		else
			cp.straight= false;
		if (cp.straight)
			cp.forcedDirection= false;
		cp.direction.negate();
	}
}

//	Adds a switch connecting mainTrack to rTrack.
let addSwitch= function(point,mainTrack,rPoint,rTrack)
{
	let pd= new THREE.Vector2(point.direction.x,point.direction.y);
	let rd= new THREE.Vector2(rPoint.position.x-point.position.x,
	  rPoint.position.y-point.position.y);
	pd.normalize();
	rd.normalize();
	let dot= pd.dot(rd);
	let cross= pd.cross(rd);
	let nTrack= addTrack();
	let pi= mainTrack.controlPoints.indexOf(point);
	let n= mainTrack.controlPoints.length;
	let p1= { position: point.position.clone() };
	let p2= { position: point.position.clone() };
	let sw= { points: [ point, p1, p2 ], grade: 0 };
	if (dot >= 0) {
		nTrack.controlPoints=
		  mainTrack.controlPoints.splice(pi+1,n-pi-1);
		reverseTrack(mainTrack);
		sw.angle= Math.atan2(pd.y,pd.x);
	} else {
		nTrack.controlPoints=
		  mainTrack.controlPoints.splice(pi,n-pi);
		reverseTrack(mainTrack);
		let tmp= mainTrack;
		mainTrack= nTrack;
		nTrack= tmp;
		sw.angle= Math.atan2(-pd.y,-pd.x);
		cross*= -1;
	}
//	console.log("addsw "+dot+" "+cross+" "+pi+" "+n+" "+sw.angle+" "+
//	  pd.x+" "+pd.y);
	point.sw= sw;
	p1.sw= sw;
	p2.sw= sw;
	let r= 164.0639;
	let a= 10*Math.PI/180;
	if (cross < 0) {
		nTrack.controlPoints.unshift(p1);
		rTrack.controlPoints.unshift(p2);
		sw.offsets= [
		  new THREE.Vector3(40,0,0),
		  new THREE.Vector3(1.51059+r*Math.sin(a),-r*(1-Math.cos(a)),0)
		];
		sw.angles= [ 0, -a ];
		sw.shapeID= 216;
	} else {
		nTrack.controlPoints.unshift(p2);
		rTrack.controlPoints.unshift(p1);
		sw.offsets= [
		  new THREE.Vector3(1.51059+r*Math.sin(a),r*(1-Math.cos(a)),0),
		  new THREE.Vector3(40,0,0)
		];
		sw.angles= [ a, 0 ];
		sw.shapeID= 218;
	}
	switches.push(sw);
}

//	Updates the control points connected to switch sw given the current
//	angle and the specified grade.
let updateSwitch= function(sw,grade,keepDir)
{
	let cs= Math.cos(sw.angle);
	let sn= Math.sin(sw.angle);
	sw.grade= grade;
	let csg= Math.sqrt(1-sw.grade*sw.grade);
	let p0= sw.points[0];
//	if (p0.extSwitchPoint)
//	 console.log("updatesw "+sw.angle+" "+cs+" "+sn+" "+grade+" "+csg);
	if (!keepDir) {
		p0.direction= new THREE.Vector3(-cs,-sn,0);
		p0.forcedDirection= 1;
	}
	if (!sw.pathOffsets)
		calcSwitchOffsets(sw);
	for (let i=1; i<sw.points.length; i++) {
		let p= sw.points[i];
		let o= sw.offsets[i-1];
//		if (p.extSwitchPoint)
//		 console.log("updatesw "+i+" "+o.x+" "+o.y+" "+sw.angles[i-1]);
		p.position.x= p0.position.x + cs*o.x*csg - sn*o.y;
		p.position.y= p0.position.y + cs*o.y + sn*o.x*csg;
		p.position.z= p0.position.z + o.x*sw.grade;
		if (!keepDir) {
//			let a= sw.angle + sw.angles[i-1];
			let a= sw.angle +
			  Math.atan(Math.tan(sw.angles[i-1])/csg);
			p.direction=
			  new THREE.Vector3(Math.cos(a),Math.sin(a),0);
			p.forcedDirection= 1;
		}
		if (p.extSwitchPoint) {
			let ep= p.extSwitchPoint;
			let dp= ep.position.clone().sub(p0.position);
			let dot= dp.dot(p0.direction);
//			console.log("extswp "+ep.position.z+" "+p0.position.z+
//			  " "+dot+" "+sw.grade);
			ep.position.z= p0.position.z - dot*sw.grade;
//			console.log("extswp "+ep.position.z);
		}
	}
	sw.pathPoints= [];
	for (let i=0; i<sw.pathOffsets.length; i++) {
		let pathOffsets= sw.pathOffsets[i];
		let pathPoints= [];
		for (let j=0; j<pathOffsets.length; j++) {
			let po= pathOffsets[j];
			let pp= {
			  x: p0.position.x + cs*po.x*csg - sn*po.y,
			  y: p0.position.y + cs*po.y + sn*po.x*csg,
			  z: p0.position.z + po.x*sw.grade,
//			  angle: sw.angle + po.angle
			  angle: sw.angle + Math.atan(Math.tan(po.angle)/csg)
			};
			pathPoints.push(pp);
		}
		sw.pathPoints.push(pathPoints);
	}
}

//	Updates all switches and the fixes control point directions.
let updateSwitches= function()
{
	for (let i=0; i<tracks.length; i++) {
		let t= tracks[i];
		let n= t.controlPoints.length;
		if (n < 2)
			continue;
		let cp= t.controlPoints[0];
		if (cp.sw && (cp.sw.shapeID==32246 || cp.sw.shapeID==32247))
			cp.extSwitchPoint= t.controlPoints[1];
		else if (cp.sw)
			cp.extSwitchPoint= null;
		cp= t.controlPoints[n-1];
		if (cp.sw && (cp.sw.shapeID==32246 || cp.sw.shapeID==32247))
			cp.extSwitchPoint= t.controlPoints[n-2];
		else if (cp.sw)
			cp.extSwitchPoint= null;
	}
	for (let i=0; i<switches.length; i++)
		updateSwitch(switches[i],switches[i].grade,false);
	for (let i=0; i<tracks.length; i++) {
		let t= tracks[i];
		let n= t.controlPoints.length;
		if (n <= 0)
			continue;
//		console.log("updsw "+i+" "+n);
		if (t.controlPoints[n-1].sw) {
			t.controlPoints[n-1].direction.negate();
			t.controlPoints[n-1].forcedDirection= 2;
//			console.log("swnegdir "+i+" "+n);
		}
	}
}

//	Calculates control point elevations for point that don't have user
//	specified elevation.
//	Finds distance from switches to specified elevation then uses
//	depth first search to find other points with specified elevation.
//	Uses a uniform grade between points with specified elevation and
//	tries to equalize grades on adjacent track.
let calcCPElevations= function()
{
	let bigDist= 1e10;
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		let n= track.controlPoints.length;
		let controlPoints= track.controlPoints;
		let cp0= controlPoints[0];
		let cpn= controlPoints[n-1];
		cp0.track= track;
		cpn.track= track;
		if (cp0.sw && cp0.calcElevation) {
			cp0.elevDist= bigDist;
		} else {
			cp0.calcElevation= false;
			cp0.elevDist= 0;
		}
		if (cpn.sw && cpn.calcElevation) {
			cpn.elevDist= bigDist;
		} else {
			cpn.calcElevation= false;
			cpn.elevDist= 0;
		}
		for (let j=1; j<n-1; j++) {
			let cp= controlPoints[j];
			if (!cp.calcElevation) {
				if (cp0.elevDist > cp.distance) {
					cp0.elevDist= cp.distance;
					cp0.position.z= cp.position.z;
//					console.log("update0 "+j);
				}
				let d= cpn.distance- cp.distance;
				if (cpn.elevDist > d) {
					cpn.elevDist= d;
					cpn.position.z= cp.position.z;
//					console.log("updaten "+j);
				}
			}
		}
		if (cp0.elevDist==0 && cpn.elevDist>cpn.distance) {
			cpn.elevDist= cpn.distance;
			cpn.position.z= cp0.position.z;
		}
		if (cpn.elevDist==0 && cp0.elevDist>cpn.distance) {
			cp0.elevDist= cpn.distance;
			cp0.position.z= cpn.position.z;
		}
//		console.log("initcalccpe "+i+" "+
//		  cp0.elevDist+" "+cp0.position.z+" "+
//		  cpn.elevDist+" "+cpn.position.z);
//		if (cp0.sw)
//			console.log("sw0 "+switches.indexOf(cp0.sw));
//		if (cpn.sw)
//			console.log("swn "+switches.indexOf(cpn.sw));
	}
	// assigns elevation using depth first search
	// only uses main switch leg if mainOnly
	let dfsMain= function(cp,elev,dist,mainOnly) {
		let sw= cp.sw;
		let main= Math.abs(sw.angles[0])<Math.abs(sw.angles[1]) ? 1 : 2;
//		console.log("dfsmain "+elev+" "+dist+" "+mainOnly+" "+main);
		if (mainOnly && cp!=sw.points[0] && cp!=sw.points[main])
			return;
		let other= cp!=sw.points[0] ? sw.points[0] : sw.points[main];
//		if (dist > 0)
//			console.log("dfsmain "+elev+" "+dist+" "+mainOnly+" "+
//			  switches.indexOf(sw)+" "+sw.points.indexOf(cp)+" "+
//			  cp.elevDist+" "+other.elevDist);
		cp.elevDist= dist;
		let d= other.position.distanceTo(cp.position);
		if (other.elevDist < bigDist) {
			let dz= elev-other.position.z;
			let dd= dist+d+other.elevDist;
			if (cp.calcElevation)
				cp.position.z= other.position.z +
				  dz*(other.elevDist+d)/dd;
			if (other.calcElevation)
				other.position.z+= dz*other.elevDist/dd;
//			console.log("dfsmainl "+dz+" "+dd+" "+other.position.z+
//			  " "+cp.position.z);
			other.elevDist= 0;
			cp.elevDist= 0;
		} else {
			let track= other.track;
			let controlPoints= track.controlPoints;
			let n= controlPoints.length;
			let trackLength= controlPoints[n-1].distance;
			let far= other==controlPoints[0] ? controlPoints[n-1] :
			  controlPoints[0];
			if (far.elevDist >= bigDist)
				dfsMain(far,elev,dist+d+trackLength,mainOnly);
			if (far.elevDist == 0) {
				let dd= dist+d+trackLength;
				let dz= elev-far.position.z;
				if (other.calcElevation)
					other.position.z= far.position.z +
					  dz*trackLength/dd;
				if (cp.calcElevation)
					cp.position.z= far.position.z +
					  dz*(trackLength+d)/dd;
//				console.log("dfsmainr "+dz+" "+dd+" "+
//				  other.position.z+" "+cp.position.z);
				other.elevDist= 0;
				cp.elevDist= 0;
			}
		}
	}
	// sets the grade at the specified switch if the point elevation is
	// known
	let setGrade= function(sw) {
		let cp0= sw.points[0];
		if (cp0.elevDist == 0) {
			if (Math.abs(sw.angles[0]) < Math.abs(sw.angles[1])) {
				sw.grade=
				  (sw.points[1].position.z-cp0.position.z)/
				  sw.offsets[0].x;
			} else {
				sw.grade=
				  (sw.points[2].position.z-cp0.position.z)/
				  sw.offsets[1].x;
			}
			updateSwitch(sw,sw.grade,true);
			for (let j=0; j<3; j++)
				sw.points[j].elevDist= 0;
		}
	}
//	for (let i=0; i<switches.length; i++) {
//		let sw= switches[i];
//		console.log("start "+i+" "+sw.points[0].elevDist+" "+
//		  sw.points[1].elevDist+" "+sw.points[2].elevDist+" "+
//		  sw.grade+" "+sw.points[0].position.x+" "+
//		  sw.points[0].position.y);
//	}
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		let cp0= sw.points[0];
		if (cp0.elevDist < bigDist) {
			dfsMain(cp0,cp0.position.z,cp0.elevDist,true);
		} else {
			let cpmain= Math.abs(sw.angles[0])<
			  Math.abs(sw.angles[1]) ? sw.points[1] : sw.points[2];
			if (cpmain.elevDist < bigDist)
				dfsMain(cpmain,cpmain.position.z,
				  cpmain.elevDist,true);
		}
		if (cp0.elevDist == 0) {
			setGrade(sw);
		}
	}
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		let cp0= sw.points[0];
		if (cp0.elevDist < bigDist) {
			dfsMain(cp0,cp0.position.z,cp0.elevDist,false);
		} else {
			let cpmain= Math.abs(sw.angles[0])<
			  Math.abs(sw.angles[1]) ? sw.points[1] : sw.points[2];
			if (cpmain.elevDist < bigDist)
				dfsMain(cpmain,cpmain.position.z,
				  cpmain.elevDist,false);
			let cprev= Math.abs(sw.angles[0])>=
			  Math.abs(sw.angles[1]) ? sw.points[1] : sw.points[2];
			if (cprev.elevDist < bigDist)
				dfsMain(cprev,cprev.position.z,cprev.elevDist,
				false);
		}
		if (cp0.elevDist == 0) {
			setGrade(sw);
		}
	}
//	for (let i=0; i<switches.length; i++) {
//		let sw= switches[i];
//		console.log("cpe "+i+" "+sw.points[0].elevDist+" "+
//		  sw.points[1].elevDist+" "+sw.points[2].elevDist+" "+sw.grade);
//	}
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		let n= track.controlPoints.length;
		let controlPoints= track.controlPoints;
		let k= 0;
		let cpk= controlPoints[0];
		for (let j=1; j<n; j++) {
			let cp= controlPoints[j];
			if (!cp.calcElevation || j==n-1) {
				let dd= cp.distance-cpk.distance;
				let dz= cp.position.z-cpk.position.z;
				for (k++; k<j; k++) {
					cpk= controlPoints[k];
					cpk.position.z= cp.position.z-
					  (cp.distance-cpk.distance)*
					  dz/dd;
//					console.log("updatez "+k+" "+j+" "+
//					  dd+" "+dz+" "+cpk.position.z);
				}
				k= j;
				cpk= cp;
			}
		}
	}
}

//	Sets switch control point grade to match switches.
let calcSwitchGrades= function()
{
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		let points= sw.points;
		for (let j=0; j<3; j++)
			points[j].cpGrade= sw.grade;
		if (points[0].forcedDirection == 1)
			points[0].cpGrade*= -1;
		if (points[1].forcedDirection == 2)
			points[1].cpGrade*= -1;
		if (points[2].forcedDirection == 2)
			points[2].cpGrade*= -1;
	}
}

//	Implements the File menu Save feature.
//	Saves all data needed to restore session in a json file.
let saveData= function(filename)
{
	let data= {
		proj4Str: proj4Str,
		centerTX: centerTX,
		centerTZ: centerTZ,
		centerU: centerU,
		centerV: centerV,
		scale: scale,
		addToTrackDb: addToTrackDB,
		tracks: [],
		switches: [],
		patchModels: [],
		noCut: []
	};
	if (tdbPath)
		data.tdbPath= tdbPath;
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		let controlPoints= track.controlPoints;
		let dTrack= { points: [] };
		if (track.type)
			dTrack.type= track.type;
		for (let j=0; j<controlPoints.length; j++) {
			let cp= controlPoints[j];
			let p= {
				position: [ cp.position.x, cp.position.y,
				  cp.position.z ],
				forcedDirection: cp.forcedDirection || 0,
				straight: cp.straight || 0,
				calcElevation: cp.calcElevation || 0,
				bridge: cp.bridge || 0
			};
			if (cp.direction)
				p.direction= [ cp.direction.x, cp.direction.y,
				  cp.direction.z ];
			if (cp.endNode)
				p.endNode= cp.endNode.id;
			if (cp.model)
				p.model= cp.model;
			if (cp.forest)
				p.forest= cp.forest;
			if (cp.name)
				p.name= cp.name;
			if (cp.dzdw)
				p.dzdw= cp.dzdw;
			if (cp.overpass)
				p.overpass= cp.overpass;
			dTrack.points.push(p);
			if (cp.sw) {
				cp.tIndex= i;
				cp.pIndex= j;
			}
		}
		data.tracks.push(dTrack);
	}
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		let swtch= {
			points: [],
			offsets: [],
			angles: [],
			angle: sw.angle,
			shapeID: sw.shapeID,
			grade: sw.grade
		};
		if (sw.switchStand)
			swtch.switchStand= true;
		for (let j=0; j<sw.points.length; j++) {
			let p= sw.points[j];
			swtch.points.push({
				track: p.tIndex,
				point: p.pIndex
			});
			if (j > 0) {
				let o= sw.offsets[j-1];
				swtch.offsets.push([ o.x, o.y, o.z ]);
				swtch.angles.push(sw.angles[j-1]);
			}
		}
		data.switches.push(swtch);
	}
	for (let i=0; i<tiles.length; i++) {
		let tile= tiles[i];
		if (tile.patchModels)
			data.patchModels.push({ tx:tile.x, tz:tile.z,
			  patchModels: tile.patchModels });
		if (tile.noCut)
			data.noCut.push({ tx:tile.x, tz:tile.z,
			  noCut: tile.noCut });
	}
	let s= JSON.stringify(data,null,1);
	if (filename.indexOf(".json") < 0)
		filename+= ".json";
	fs.writeFileSync(filename,s);
}

//	Implements the File menu Open function.
//	Reads a previously saved json file.
//	Needs to handle files created by earlier version which might be
//	missing some fields.
let readData= function(filename)
{
	let s= fs.readFileSync(filename);
	let data= JSON.parse(s);
	if (data.tdbPath) {
		trackDB= readTrackDB(data.tdbPath);
		readTiles();
	} else {
		tdbPath= null;
	}
	centerTX= data.centerTX;
	centerTZ= data.centerTZ;
	centerU= data.centerU;
	centerV= data.centerV;
	scale= data.scale;
	proj4Str= data.proj4Str;
	if (proj4Str.length > 0) {
		proj4= require('proj4');
		projection= proj4(proj4Str);
	}
	if (data.addToTrackDB)
		addToTrackDB= true;
	else
		addToTrackDB= false;
	tracks= [];
	switches= [];
	for (let i=0; i<data.tracks.length; i++) {
		let dTrack= data.tracks[i];
		let points= dTrack.points || dTrack;
		let track= addTrack();
		if (dTrack.type)
			track.type= dTrack.type;
		for (let j=0; j<points.length; j++) {
			let dp= points[j];
			let p= {
				position: new THREE.Vector3(dp.position[0],
				  dp.position[1],dp.position[2]),
				straight: dp.straight,
				forcedDirection: dp.forcedDirection,
				calcElevation: dp.calcElevation || 0,
				bridge: dp.bridge || 0,
				overpass: dp.overpass || 0
			};
			if (dp.direction)
				p.direction= new THREE.Vector3(dp.direction[0],
				  dp.direction[1],dp.direction[2]);
			if (dp.endNode && dp.endNode<trackDB.nodes.length)
				p.endNode= trackDB.nodes[dp.endNode];
			if (dp.model)
				p.model= dp.model;
			if (dp.forest)
				p.forest= dp.forest;
			if (dp.name)
				p.name= dp.name;
			if (dp.dzdw)
				p.dzdw= dp.dzdw;
			track.controlPoints.push(p);
		}
	}
	for (let i=0; i<data.switches.length; i++) {
		let dSwitch= data.switches[i];
		let sw= {
			points: [],
			offsets: [],
			angles: [],
			angle: dSwitch.angle,
			shapeID: dSwitch.shapeID,
			grade: 0
		};
		if (dSwitch.grade)
			sw.grade= dSwitch.grade;
		if (dSwitch.switchStand)
			sw.switchStand= dSwitch.switchStand;
		for (let j=0; j<dSwitch.points.length; j++) {
			let sp= dSwitch.points[j];
			let cp= tracks[sp.track].controlPoints[sp.point];
			sw.points.push(cp);
			cp.sw= sw;
			if (j > 0) {
				let o= dSwitch.offsets[j-1];
				sw.offsets.push(
				  new THREE.Vector3(o[0],o[1],o[2]));
				sw.angles.push(dSwitch.angles[j-1]);
			}
		}
		switches.push(sw);
	}
	for (let i=0; data.patchModels && i<data.patchModels.length; i++) {
		let dpm= data.patchModels[i];
		let tile= findTile(dpm.tx,dpm.tz);
		if (tile)
			tile.patchModels= dpm.patchModels;
	}
	for (let i=0; data.noCut && i<data.noCut.length; i++) {
		let dnc= data.noCut[i];
		let tile= findTile(dnc.tx,dnc.tz);
		if (tile)
			tile.noCut= dnc.noCut;
	}
	calcTrack();
	renderCanvas();
	readMaps();
}

//	Reads a projection.json file to setup the projection.
let readProjection= function()
{
	try {
		let path= routeDir+fspath.sep+"projection.json";
//		console.log("path "+path);
		let s= fs.readFileSync(path);
		let data= JSON.parse(s);
		proj4Str= data.proj4Str;
		centerTX= data.centerTX;
		centerTZ= data.centerTZ;
		proj4= require('proj4');
		projection= proj4(proj4Str);
	} catch (e) {
//		console.log("cannot read projection.json");
		proj4Str= "";
		projection= null;
	}
}

//	Reads a maps.json file to setup the local map images.
let readMaps= function()
{
	try {
		let path= routeDir+fspath.sep+"maps.json";
		console.log("path "+path);
		let s= fs.readFileSync(path);
		maps= JSON.parse(s);
		for (let i=0; i<maps.length; i++) {
			let map= maps[i];
			let p1= map.refpoints[0];
			let p2= map.refpoints[1];
			let uv1= ll2uv(p1.lat,p1.lng);
			let uv2= ll2uv(p2.lat,p2.lng);
			console.log("map "+uv1.u+" "+uv1.v+" "+uv2.u+" "+uv2.v);
			let dx= p2.x - p1.x;
			let dy= p1.y - p2.y;
			let du= uv2.u - uv1.u;
			let dv= uv2.v - uv1.v;
			let dxy= Math.sqrt(dx*dx+dy*dy);
			let duv= Math.sqrt(du*du+dv*dv);
			let axy= Math.atan2(dy,dx);
			let auv= Math.atan2(dv,du);
			console.log("map "+dxy+" "+duv+" "+axy+" "+auv);
			let cx= map.width/2 + map.x0;
			let cy= map.height/2 + map.y0;
			let cs= Math.cos(axy-auv);
			let sn= Math.sin(axy-auv);
			let scale= duv/dxy;
			dx= cx-p1.x;
			dy= p1.y-cy;
			let cu= uv1.u + scale*(cs*dx - sn*dy);
			let cv= uv1.v + scale*(cs*dy + sn*dx);
			map.u= cu;
			map.v= cv;
			map.wid= scale*map.width;
			map.hgt= scale*map.height;
			map.skew= 0;
			map.cos= cs;
			map.sin= sn;
			map.scale= scale;
			map.angle= axy-auv;
			console.log("map "+scale+" "+cu+" "+cv);
		}
	} catch (e) {
		console.log("cannot read maps.json");
		console.log(e);
		maps= null;
	}
}

//	Implements the Edit menu Cut function.
let cutTerrain= function()
{
	cutAndFill(true);
}

//	Implements the Edit menu Fill&Cut function.
let fillTerrain= function()
{
	cutAndFill(false);
	cutAndFill(true);
}

//	Raises or lowers the terrain elevation near the track between the
//	selected control point and the next control point
//	to match track elevation.
let cutAndFill= function(cut)
{
	if (!selected)
		return;
	if (selectedTrack.controlPoints.length==1 && selected.model &&
	  !selected.model.size) {
		selected.model.size= { w:10, h:10 };
		renderCanvas();
		return;
	}
	let adjElevation= function(x,y,elev) {
		let e= getElevation(x,y,false);
		if (cut ? (e>=elev) : (e<=elev))
			setElevation(x,y,elev);
	}
	let step= 2;
	if (selected.sw) {
		let p0= selected.sw.points[0];
		let p1= selected.sw.points[1];
		let dp= p1.position.clone().sub(p0.position);
		let da= step/dp.length();
		let perp= new THREE.Vector2(dp.y,dp.x);
		perp.normalize();
		let dx= 2*perp.x;
		let dy= 2*perp.y;
		for (let a=0; a<=1; a+= da) {
			let p= dp.clone().multiplyScalar(a).add(p0.position);
			let elev= p.z;
			adjElevation(p.x,p.y,elev);
			adjElevation(p.x+dx,p.y+dy,elev);
			adjElevation(p.x-dx,p.y+dy,elev);
			adjElevation(p.x+dx,p.y-dy,elev);
			adjElevation(p.x-dx,p.y-dy,elev);
		}
	}
	let controlPoints= selectedTrack.controlPoints;
	let trackPoints= selectedTrack.trackPoints;
	let index= controlPoints.indexOf(selected);
	if (index >= controlPoints.length-1) {
		let x= selected.position.x;
		let y= selected.position.y;
		let dx= 4*selected.direction.x;
		let dy= 4*selected.direction.y;
		let e= getElevation(x,y,false);
		adjElevation(x,y,e);
		adjElevation(x+dx,y+dy,e);
		adjElevation(x+dx,y-dy,e);
		adjElevation(x-dx,y-dy,e);
		adjElevation(x-dx,y+dy,e);
		return;
	}
	let next= controlPoints[index+1];
	let p0= trackPoints[0];
	let dist0= 0;
	let dist= 0;
	if (selected.distance <= dist) {
		let p1= trackPoints[1];
		let perp= new THREE.Vector2(p1.y-p0.y,p1.x-p0.x);
		perp.normalize();
		let dx= 2*perp.x;
		let dy= 2*perp.y;
		let e= getElevation(p0.x,p0.y,false);
		adjElevation(p0.x,p0.y,e);
		adjElevation(p0.x+dx,p0.y+dy,e);
		adjElevation(p0.x-dx,p0.y+dy,e);
		adjElevation(p0.x+dx,p0.y-dy,e);
		adjElevation(p0.x-dx,p0.y-dy,e);
	}
	for (let i=1; i<trackPoints.length; i++) {
		let p1= trackPoints[i];
		let d= p1.distanceTo(p0);
		let perp= new THREE.Vector2(p1.y-p0.y,p1.x-p0.x);
		perp.normalize();
		let dx= 2*perp.x;
		let dy= 2*perp.y;
		while (dist+step <= dist0+d) {
			dist+= step;
			let a= (dist-dist0)/d;
			let x= (1-a)*p0.x + a*p1.x;
			let y= (1-a)*p0.y + a*p1.y;
			if (selected.distance<=dist && dist<=next.distance) {
				let elev= interpElevation(selected,next,
				  (dist-selected.distance)/
				  (next.distance-selected.distance));
				adjElevation(x,y,elev);
				adjElevation(x+dx,y+dy,elev);
				adjElevation(x-dx,y+dy,elev);
				adjElevation(x+dx,y-dy,elev);
				adjElevation(x-dx,y-dy,elev);
			}
		}
		dist0+= d;
		p0= p1;
	}
	if (next.distance >= dist) {
		let elev= next.position.z;
		adjElevation(p0.x,p0.y,elev);
	}
	makeGroundPoints(selectedTrack,false);
	renderCanvas();
}

//	Creates a selectedGroup array that includes control points
//	connected to the selected control point by straights or switches.
let selectGroup= function()
{
	if (!selected)
		return;
	let controlPoints= selectedTrack.controlPoints;
	let index= controlPoints.indexOf(selected);
	let group= [];
	for (let i=index-1; i>=0; i--) {
		let cp= controlPoints[i];
		if (!cp.straight)
			break;
		group.push(cp);
	}
	for (let i=index; i<controlPoints.length-1; i++) {
		let cp= controlPoints[i];
		if (!cp.straight)
			break;
		group.push(controlPoints[i+1]);
	}
	let queue= [];
	if (selected.sw)
		queue.push(selected.sw);
	let cp= controlPoints[0];
	if (cp!=selected && cp.sw && group.indexOf(cp)>=0)
		queue.push(cp.sw);
	if (controlPoints.length > 1) {
		cp= controlPoints[controlPoints.length-1];
		if (cp!=selected && cp.sw && group.indexOf(cp)>=0)
			queue.push(cp.sw);
	}
	for (let i=0; i<queue.length; i++) {
		let sw= queue[i];
		for (let j=0; j<3; j++) {
			let cp= sw.points[j];
			if (group.indexOf(cp) >= 0)
				continue;
			group.push(cp);
			let track= findTrack(cp);
			controlPoints= track.controlPoints;
			let n= controlPoints.length;
			if (cp == controlPoints[0]) {
				for (let k=0; k<n-1 && cp.straight; k++) {
					cp= controlPoints[k+1];
					group.push(cp);
					if (cp.sw)
						queue.push(cp.sw);
				}
			} else {
				for (let k=n-2; k>=0; k--) {
					cp= controlPoints[k];
					if (!cp.straight)
						break;
					group.push(cp);
					if (cp.sw)
						queue.push(cp.sw);
				}
			}
		}
	}
	selectedGroup= group.length>0 ? group : null;
//	console.log("selgroup "+index+" "+group.length);
	renderCanvas();
}

let calcSpiral= function(curve)
{
	if (curve.radius == 0)
		return { radius: 0, lc: 0 };
	let speedLimit= 60;// miles per hour, should come from .trk file
	let radius= curve.radius;
	let angle= Math.abs(curve.angle);
	let t= radius*Math.tan(angle/2);
	let best= { speed: Math.sqrt(3/(.0007*radius2deg(radius))),
	  radius: radius, xc: 0, yc: 0, lc: 0, sc: 0 };
//	console.log("spiral "+radius+" "+angle+" "+t);
	for (let superElevation=0; superElevation<=5; superElevation+=.25) {
		for (let i=0; i<5; i++) {
			let deg= radius2deg(radius);
			let speed= Math.sqrt((superElevation+3)/(.0007*deg));
			let lc= .3048*1.63*superElevation*speed;
			let sc= .5*lc/radius;
			if (2*sc > angle)
				return best;
			let xc= lc*lc/(6*radius);
			let yc= lc - lc*lc*lc/(40*radius*radius);
			let q= yc - radius*Math.sin(sc);
			let p= xc - radius*(1-Math.cos(sc));
			radius= (t-q)/Math.tan(angle/2) - p;
//			console.log("spiral "+radius.toFixed(3)+" "+
//			  speed.toFixed(3)+" "+
//			  superElevation.toFixed(3)+
//			  " "+lc.toFixed(3)+" "+sc.toFixed(5));
			if (i==4 && speed>best.speed) {
				best.speed= speed;
				best.radius= radius;
				best.xc= xc;
				best.yc= yc;
				best.lc= lc;
				best.sc= sc;
			}
		}
	}
	return best;
}

//	Implements the Edit menu Change Switch Type feature
let changeSwitchType= function()
{
	if (!selected || !selected.sw)
		return;
	let sw= selected.sw;
	sw.shapeID= document.getElementById("switchtype").value;
	calcSwitchOffsets(sw);
	calcTrack();
	renderCanvas();
}

//	Implements the Edit menu Switch Stand feature
let toggleSwitchStand= function()
{
	if (!selected || !selected.sw)
		return;
	let sw= selected.sw;
	sw.switchStand= !sw.switchStand;
}

//	Implements the Edit menu Change Track Type feature
let changeTrackType= function()
{
	if (!selectedTrack)
		return;
	selectedTrack.type= document.getElementById("tracktype").value;
}

//	Implements the Edit menu Change Track Name feature
let changeTrackName= function()
{
	if (!selected)
		return;
	selected.name= document.getElementById("trackname").value;
}

//	Calculates offsets of switch internal and frog ends points
//	relative to the points given the shape.
let calcSwitchOffsets= function(sw)
{
	let shape= trackDB.tSection.shapes[sw.shapeID];
	sw.pathOffsets= [];
	for (let i=0; i<2; i++) {
		let x= 0;
		let y= 0;
		let angle= 0;
		let dir= { x: 1, y: 0 };
		let sections= shape.paths[i].sections;
		let pathOffsets= [ { x: 0, y: 0, angle: 0 } ];
		for (let j=0; j<sections.length; j++) {
			let sectionID= sections[j];
			let section= trackDB.tSection.sections[sectionID];
			if (section.length) {
				let len= section.length;
				x+= len*dir.x;
				y+= len*dir.y;
			} else {
				let a= section.angle*Math.PI/180;
				let t= section.radius*Math.tan(Math.abs(a/2));
//				console.log("t "+t+" "+section.radius+" "+
//				  section.angle+" "+a);
				x+= t*dir.x;
				y+= t*dir.y;
				let cos= Math.cos(a);
				let sin= Math.sin(-a);
				let dx= dir.x;
				let dy= dir.y;
				dir.x= cos*dx - sin*dy;
				dir.y= cos*dy + sin*dx;
				x+= t*dir.x;
				y+= t*dir.y;
				angle-= a;
			}
			pathOffsets.push({ x: x, y: y, angle: angle });
		}
		sw.offsets[i]= new THREE.Vector3(x,y,0);
		sw.angles[i]= angle;
		sw.pathOffsets[i]= pathOffsets;
	}
}

//	Implements the Edit menu Simplify Track feature.
let simplify= function()
{
	if (!selectedTrack)
		return;
	let controlPoints= selectedTrack.controlPoints;
	if (controlPoints.length < 2)
		return;
	calcDirection(selectedTrack);
	let points= [];
	for (let i=0; i<controlPoints.length; i++) {
		let cp= controlPoints[i];
		points.push({
		  position: new THREE.Vector2(cp.position.x,cp.position.y),
		  direction: new THREE.Vector2(cp.direction.x,cp.direction.y).
		   normalize(),
		});
	}
	let esq= 0;
	for (let i=1; i<points.length-2; i++) {
		let p1= points[i].position;
		let p2= points[i+1].position;
		let d1= points[i].direction;
		let d2= points[i+1].direction;
		let dp= p2.clone().sub(p1);
		dp.normalize();
		let dot1= dp.dot(d1);
		let dot2= dp.dot(d2);
		let cross1= d1.cross(dp);
		let cross2= dp.cross(d2);
		if (dot1>0 && dot2>0 &&
		  ((cross1>0 && cross2<0) || (cross1<0 && cross2>0))) {
			let p0= points[i-1].position;
			let p3= points[i+2].position;
			let dsq= lineDistSq(p1.x,p1.y,p0.x,p0.y,p3.x,p3.y);
			if (esq < dsq)
				esq= dsq;
			dsq= lineDistSq(p2.x,p2.y,p0.x,p0.y,p3.x,p3.y);
			if (esq < dsq)
				esq= dsq;
			console.log("scurve "+p0.distanceTo(p3)+" "+esq);
		}
	}
	console.log("esq "+esq+" "+Math.sqrt(esq));
	for (let i=0; i<points.length-1; i++) {
		let pi= points[i].position;
		let c= " ";
		if (i > 0) {
			let p0= points[i-1].position;
			let p1= points[i+1].position;
			let a= triArea(p0.x,p0.y,pi.x,pi.y,p1.x,p1.y);
			if (a < 0)
				c= "-";
			else if (a > 0)
				c= "+";
		}
		for (let j=i+2; j<points.length; j++) {
			let pj= points[j].position;
			let n= 0;
			for (let k=i+1; k<j; k++) {
				let pk= points[k].position;
				let dsq=
				  lineDistSq(pk.x,pk.y,pi.x,pi.y,pj.x,pj.y);
				if (dsq > esq)
					break;
				n++;
			}
			if (n < j-i-1) {
				console.log(" "+i+" "+c+" "+(j-1)+" "+(j-i));
				break;
			}
		}
	}
}

//	Implements the Edit menu Attach Model feature
let attachModel= function()
{
	if (!selected)
		return;
	var shape= document.getElementById("shapefile").value;
	var vOffset= document.getElementById("voffset").value;
	console.log("shapefile "+shape+" "+vOffset);
	selected.model= {
		filename: fspath.basename(shape),
		vOffset: parseFloat(vOffset)
	};
	renderCanvas();
}

let treeData= {
	oak: {	texture: "BurOak.ace",
		scale0: .9, scale1: 1.7, sizew: 14, sizeh: 17
	},
	pine: {	texture: "MSAmericanPine31E.ace",
		scale0: .9, scale1: 1.4, sizew: 9, sizeh: 17
	},
	birch: { texture: "PaperBirch.ace",
		scale0: .9, scale1: 1.7, sizew: 12, sizeh: 15
	},
	sugarmaple: { texture: "SugarMaple.ace",
		scale0: .9, scale1: 1.6, sizew: 12, sizeh: 14
	},
	norwaymaple: { texture: "CrimsonNorwayMaple.ace",
		scale0: .8, scale1: 1.5, sizew: 12, sizeh: 15
	},
	fieldmaple: { texture: "MSFieldMaple23E.ace",
		scale0: .7, scale1: 1.3, sizew: 12, sizeh: 14
	}
};

//	Implements the Edit menu Attach Forest feature
let attachForest= function()
{
	if (!selected)
		return;
	var treeType= document.getElementById("treetype").value;
	var density= document.getElementById("density").value;
	var treeType2= document.getElementById("treetype2").value;
	var density2= document.getElementById("density2").value;
	var tdata= treeData[treeType];
	if (!selected.forest) {
		selected.forest= {
			areaw: 400,
			areah: 400,
			sizew: tdata.sizew
		};
		alignForest(selected);
	}
	selected.forest.density= parseFloat(density);
	selected.forest.texture= tdata.texture;
	selected.forest.scale0= tdata.scale0;
	selected.forest.scale1= tdata.scale1;
	selected.forest.sizew= tdata.sizew;
	selected.forest.sizeh= tdata.sizeh;
	if (treeType2 != treeType) {
		var tdata= treeData[treeType2];
		selected.forest.type2= {
			density: parseFloat(density2),
			texture: tdata.texture,
			scale0: tdata.scale0,
			scale1: tdata.scale1,
			sizew: tdata.sizew,
			sizeh: tdata.sizeh
		};
	} else {
		selected.forest.type2= null;
	}
	renderCanvas();
}

let getElevatedTrack= function(minHgt)
{
	let eTracks= [];
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		let controlPoints= track.controlPoints;
		if (controlPoints.length < 2)
			continue;
		let cp0= controlPoints[0];
		let cp1= controlPoints[0];
		let k= 1;
		let trackPoints= track.trackPoints;
		let dist= 0;
		let tp0= trackPoints[0];
		let eTrack= null;
		let elev= getElevation(tp0.x,tp0.y,true);
		if (cp0.position.z-elev > minHgt) {
			let etp= tp0.clone();
			etp.tElev= cp0.position.z;
			etp.gElev= elev;
			eTrack= [etp];
		}
		for (let j=1; j<trackPoints.length; j++) {
			let tp1= trackPoints[j];
			dist+= tp1.distanceTo(tp0);
			while (dist>cp1.distance && k<controlPoints.length-1) {
				cp0= cp1;
				k++;
				cp1= controlPoints[k];
			}
			let te= interpElevation(cp0,cp1,
			  (dist-cp0.distance)/(cp1.distance-cp0.distance));
			let ge= getElevation(tp1.x,tp1.y,true);
			if (te-ge > minHgt) {
				let etp= tp1.clone();
				etp.tElev= te;
				etp.gElev= ge;
				if (eTrack)
					eTrack.push(etp);
				else
					eTrack= [etp];
			} else if (eTrack) {
				eTracks.push(eTrack);
				eTrack= null;
			}
			tp0= tp1;
		}
		if (eTrack)
			eTracks.push(eTrack);
	}
	return eTracks;
}

let saveElevatedTracks= function()
{
	let eTracks= getElevatedTrack(.5);
	let s= JSON.stringify(eTracks,null,1);
	let path= routeDir+fspath.sep+"elevatedTracks.json";
	fs.writeFileSync(path,s);
}

let calcTrackPointElevations= function()
{
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		let controlPoints= track.controlPoints;
		let dynTrackPoints= track.dynTrackPoints;
		if (dynTrackPoints.length < 2)
			continue;
		if (controlPoints.length < 2)
			continue;
		let trackPoints= track.trackPoints;
		let dp0= dynTrackPoints[0];
		let dp1= dynTrackPoints[1];
		let cp0= controlPoints[0];
		let cp1= controlPoints[1];
		let tp0= trackPoints[cp0.trackPoint];
		tp0.z= interpElevation(cp0,cp1,0);
		for (let j=1; j<dynTrackPoints.length; j++) {
			dp1= dynTrackPoints[j];
			let dist= dp0.distance;
			for (let k=dp0.trackPoint+1; k<=dp1.trackPoint; k++) {
				let tp1= trackPoints[k];
				dist+= tp1.distanceTo(tp0);
				if (dist > dp1.distance)
					dist= dp1.distance;
				let a= (dist-dp0.distance)/
				  (dp1.distance-dp0.distance);
				tp1.z= a*dp1.elevation + (1-a)*dp0.elevation;
				tp0= tp1;
			}
			dp0= dp1;
		}
		let dzdw0= cp0.dzdw || 0;
		let dzdw1= cp1.dzdw || 0;
		tp0= trackPoints[cp0.trackPoint];
		tp0.dzdw= dzdw0;
		for (let j=1; j<controlPoints.length; j++) {
			cp1= controlPoints[j];
//			console.log(" "+j+" "+cp1);
			dzdw1= cp1.dzdw || 0;
			let dist= cp0.distance;
			for (let k=cp0.trackPoint+1; k<=cp1.trackPoint; k++) {
				let tp1= trackPoints[k];
				dist+= tp1.distanceTo(tp0);
				if (dist > cp1.distance)
					dist= cp1.distance;
				let a= (dist-cp0.distance)/
				  (cp1.distance-cp0.distance);
				tp1.dzdw= a*dzdw1 + (1-a)*dzdw0;
				tp0= tp1;
//				if (tp1.dzdw)
//					console.log("dzdw "+tp1.dzdw+" "+
//					  i+" "+j+" "+k);
			}
			cp0= cp1;
			dzdw0= dzdw1;
		}
	}
}

let alignForest= function(cp)
{
	let x= cp.position.x;
	let y= cp.position.y;
	let bestd= 1e6;
	let bestp= null;
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		let trackPoints= track.trackPoints;
		let p0= trackPoints[0];
		for (let j=1; j<trackPoints.length; j++) {
			let p1= trackPoints[j];
			let d= lineSegDistSq(x,y,p0.x,p0.y,p1.x,p1.y);
			if (d < bestd) {
				bestd= d;
				bestp= lineSegNearest(x,y,p0.x,p0.y,p1.x,p1.y);
			}
			p0= p1;
		}
	}
	if (bestp) {
		cp.direction=
		  new THREE.Vector3(bestp.x-x,bestp.y-y,0).normalize();
		let areaw= 2*(Math.sqrt(bestd)-cp.forest.sizew-5);
		if (areaw < cp.forest.areaw)
			cp.forest.areaw= areaw;
	}
}

//	find a track given a control point at either end
let findTrack= function(cp)
{
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		let controlPoints= track.controlPoints;
		if (controlPoints.length>0 &&
		  (controlPoints[0]==cp ||
		   controlPoints[controlPoints.length-1]==cp))
			return track;	
	}
	return null;
}

//	return a list of interior track faces assuming track is planar
//	and switch points are in cw order
let findTrackFaces= function(type)
{
	let faces= [];
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		if (triArea(sw.points[0].x,sw.points[0].y,
		  sw.points[1].x,sw.points[1].y,
		  sw.points[2].x,sw.points[2].y) > 0)
			console.log("sw "+i+" points in ccw order");
	}
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		let cp0= sw.points[2];
		let face= { sw: sw, tracks: [] };
		for (let j=0; j<10; j++) {
			let track= findTrack(cp0);
			if (type && track.type!=type)
				continue;
			let controlPoints= track.controlPoints;
			let cp1= cp0==controlPoints[0] ?
			  controlPoints[controlPoints.length-1] :
			  controlPoints[0];
			if (!cp1.sw)
				break;
			face.tracks.push(track);
			let k= cp1.sw.points.indexOf(cp1);
			if (k==1 && switches.indexOf(cp1.sw)<i)
				break;
			cp0= k==2 ? cp1.sw.points[0] : cp1.sw.points[k+1]
			if (cp0 == sw.points[2]) {
				faces.push(face);
				break;
			}
		}
	}
//	console.log(faces);
	return faces;
}

let getFaceTrackPoints= function(face)
{
	let sw= face.sw;
	let points= [];
	for (let i=0; i<face.tracks.length; i++) {
		let track= face.tracks[i];
		let controlPoints= track.controlPoints;
		let trackPoints= track.trackPoints;
		console.log("sw "+i+" "+
		  sw.points[0].position.x+" "+sw.points[0].position.y);
		if (sw == controlPoints[0].sw) {
			for (let j=0; j<trackPoints.length; j++)
				points.push(trackPoints[j]);
			sw= controlPoints[controlPoints.length-1].sw;
		} else {
			for (let j=trackPoints.length-1; j>=0; j--)
				points.push(trackPoints[j]);
			sw= controlPoints[0].sw;
		}
	}
	let p= points[0];
	console.log("facep0 "+p.x+" "+p.y+" "+p.z);
	p= points[points.length-1];
	console.log("facepn "+p.x+" "+p.y+" "+p.z);
//	p= points[points.length/2];
//	console.log("facep/2 "+p.x+" "+p.y+" "+p.z);
	return points;
}

let setLength= function()
{
	if (!selected || !selected.straight)
		return;
	let i= selectedTrack.controlPoints.indexOf(selected);
	if (i==selectedTrack.length-1)
		return;
	let cp2= selectedTrack.controlPoints[i+1];
	let d= selected.position.distanceTo(cp2.position);
	let dist= parseFloat(document.getElementById("tracklength").value);
	if (dist <= 0)
		return;
	let dd= d-dist;
	selected.position.x+= selected.direction.x*dd;
	selected.position.y+= selected.direction.y*dd;
	calcTrack();
	renderCanvas();
}

let setCrossingLevel= function()
{
	if (!selected)// || !selected.straight)
		return;
	let k= selectedTrack.controlPoints.indexOf(selected);
	if (k==selectedTrack.length-1)
		return;
	console.log("set crossing "+selected.straight);
	calcTrackPointElevations();
	let p1= selected.position;
	let cp2= selectedTrack.controlPoints[k+1];
	let p2= cp2.position;
	let de= 0;
	let dot= 0;
	let grade= 0;
	let s= 0;
	let left= false;
	let n= 0;
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track == selectedTrack)
			continue;
		let controlPoints= track.controlPoints;
		if (controlPoints.length < 2)
			continue;
		for (let j=0; j<controlPoints.length-1; j++) {
			let cp= controlPoints[j];
			if (cp==selected)// || !cp.straight)
				continue;
			let cp1= controlPoints[j+1];
//			let pi= segSegInt(p1,p2,cp.position,cp1.position);
			let pi= trackTrackInt(selectedTrack,track,selected,cp2,
			  cp,cp1);
			if (pi.d==0 || pi.s<0 || pi.s>1 || pi.t<0 || pi.t>1)
				continue;
//			let e1= trackElevation(selectedTrack,selected,cp2,pi.s);
//			let e2= trackElevation(track,cp,cp1,pi.t);
			let e1= interpElevation(selected,cp2,pi.s);
			let e2= interpElevation(cp,cp1,pi.t);
			de+= (e2-e1);
			grade+= cp.trackGrade;
			if (triArea(selected.position.x,selected.position.y,
			  cp2.position.x,cp2.position.y,
			  cp.position.x,cp.position.y) > 0)
				left= true;
			dot+= pi.dot;
			s+= pi.s;
			n++;
			console.log("crossing pi "+pi.x+" "+pi.y+" "+e1+" "+e2+
			 " "+i+" "+j+" "+pi.s+" "+pi.t+" "+
			 triArea(selected.position.x,selected.position.y,
			  cp2.position.x,cp2.position.y,
			  cp.position.x,cp.position.y)+" "+grade+" "+dot);
//			return;
		}
	}
	if (n > 0) {
		de/= n;
		grade/= n;
		dot/= n;
		s/= n;
		let offset=
		  parseFloat(document.getElementById("crossingoffset").value);
		de+= offset -
		  s*dot*grade*(cp2.distance-selected.distance);
		selected.position.z+= de;
		cp2.position.z= selected.position.z +
		  dot*grade*(cp2.distance-selected.distance);
		let sn= Math.sqrt(1-dot*dot);
		if (left)
			sn= -sn;
		selected.dzdw= grade*sn;
		cp2.dzdw= grade*sn;
		calcTrack();
		renderCanvas();
		console.log("crossing de "+de+" "+grade+" "+offset+" "+
		  dot+" "+sn+" "+selected.position.z+" "+cp2.position.z+" "+s+
		  " "+left);
	}
}

let trackElevation= function(track,cp0,cp1,a)
{
	let da= a*(cp1.distance-cp0.distance);
	console.log("trackE "+da+" "+a);
	let trackPoints= track.trackPoints;
	let tp0= trackPoints[cp0.trackPoint];
	for (let k=cp0.trackPoint+1; k<=cp1.trackPoint; k++) {
		let tp1= trackPoints[k];
		let d= tp1.distanceTo(tp0);
		console.log(" "+da+" "+d);
		if (d > da) {
			a= da/d;
			console.log(" "+a+" "+tp1.z+" "+tp0.z);
			return a*tp1.z + (1-a)*tp0.z;
		}
		da-= d;
		tp0= tp1;
	}
	console.log(" "+tp0.z);
	return tp0.z;
}

let trackTrackInt= function(track1,track2,cp11,cp12,cp21,cp22)
{
	if (cp11.straight && cp21.straight) {
		let pi= segSegInt(cp11.position,cp12.position,
		  cp21.position,cp22.position);
		pi.dot= cp11.direction.dot(cp21.direction);
		return pi;
	}
	let trackPoints1= track1.trackPoints;
	let trackPoints2= track2.trackPoints;
	let d1= 0;
	for (let i=cp11.trackPoint; i<cp12.trackPoint; i++) {
		let tp11= trackPoints1[i];
		let tp12= trackPoints1[i+1];
		let d2= 0;
		for (let j=cp21.trackPoint; j<cp22.trackPoint; j++) {
			let tp21= trackPoints2[j];
			let tp22= trackPoints2[j+1];
			let pi= segSegInt(tp11,tp12,tp21,tp22);
			if (pi.d==0 || pi.s<0 || pi.s>1 || pi.t<0 || pi.t>1) {
				d2+= tp22.distanceTo(tp21);
				continue;
			}
			d1+= pi.s*tp12.distanceTo(tp11);
			d2+= pi.t*tp22.distanceTo(tp21);
			pi.s= d1/(cp12.distance-cp11.distance);
			pi.t= d2/(cp22.distance-cp21.distance);
			if (pi.s > 1)
				pi.s= 1;
			if (pi.t > 1)
				pi.t= 1;
			let dir1= tp12.clone().sub(tp11);
			let dir2= tp22.clone().sub(tp21);
			dir1.normalize();
			dir2.normalize();
			pi.dot= dir1.dot(dir2);
			return pi;
		}
		d1+= tp12.distanceTo(tp11);
	}
	return { d:0 };
}

let findDynTrackPoint= function(track,cp)
{
	let dynTrackPoints= track.dynTrackPoints;
	for (let j=0; j<dynTrackPoints.length-1; j++) {
		let dp= dynTrackPoints[j];
		if (dp.controlPoint == cp)
			return dp;
	}
	return null;
}

let matchCrossingPoints= function()
{
	let crossings= [];
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		let controlPoints= track.controlPoints;
		for (let j=0; j<controlPoints.length-1; j++) {
			let cp= controlPoints[j];
			if (cp.bridge && cp.bridge=="crossing")
				crossings.push({track:track,
				  cp1:cp, cp2:controlPoints[j+1]});
		}
	}
	for (let i=0; i<crossings.length; i++) {
		let ci= crossings[i];
		for (let j=i+1; j<crossings.length; j++) {
			let cj= crossings[j];
			let pi= trackTrackInt(ci.track,cj.track,ci.cp1,ci.cp2,
			  cj.cp1,cj.cp2);
			if (pi.d==0 || pi.s<0 || pi.s>1 || pi.t<0 || pi.t>1)
				continue;
			ci.cp1.otherCrossing= cj;
			cj.cp1.otherCrossing= ci;
			ci.dtp= findDynTrackPoint(ci.track,ci.cp1);
			cj.dtp= findDynTrackPoint(cj.track,cj.cp1);
			if (ci.dtp && cj.dtp) {
				ci.dtp.otherCrossing= cj;
				cj.dtp.otherCrossing= ci;
			}
		}
	}
}
