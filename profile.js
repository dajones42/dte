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

//	profile drawing related code

let centerD= 0;	// center of drawing in horizontal distance direction
let centerE= 0;	// center of drawing in vertical elevation direction

//	initialize profile display
let setupProfile= function()
{
	let canvas= document.getElementById('profilecanvas');
	canvas.addEventListener('mousedown',profileMouseDown);
	canvas.addEventListener('mousemove',profileMouseMove);
	canvas.addEventListener('mouseup',profileMouseUp);
}

//	handle mouse down event in profile canvas
//	change selected control point and set up dragging
let profileMouseDown= function(event)
{
	if (!selectedTrack)
		return;
	let canvas= document.getElementById('profilecanvas');
	downX= event.pageX-canvas.offsetLeft;
	downY= event.pageY-canvas.offsetTop;
	let width= canvas.width;
	let height= canvas.height;
	if (event.shiftKey) {
		centerD-= (width/2-downX)/scale;
		centerE+= (height/2-downY)/scale/10;
		renderCanvas();
	} else {
		let bestD= 40;
		let bestPoint= null;
		let controlPoints= selectedTrack.controlPoints;
		for (let i=0; i<controlPoints.length; i++) {
			let point= controlPoints[i];
			let u= (point.distance-centerD)*scale + width/2;
			let v= height/2 - (point.position.z-centerE)*scale*10;
			dx= u - downX;
			dy= v - downY;
			let d= dx*dx + dy*dy;
			if (d < bestD) {
				bestD= d;
				bestPoint= point;
			}
		}
		if (bestPoint && !bestPoint.endNode) {
			selected= bestPoint;
			selectedGroup= null;
			dragging= bestPoint;
		} else {
			dragging= null;
		}
		renderCanvas();
	}
}

//	handle mouse move event in profile canvas
//	allow vertical dragging of selected control point
let profileMouseMove= function(event)
{
	if (dragging) {
		let canvas= document.getElementById('profilecanvas');
		let height= canvas.height;
		let upY= event.pageY-canvas.offsetTop;
		let z= centerE - (upY-height/2)/scale/10;
		if (dragging.sw) {
			let i= dragging.sw.points.indexOf(dragging);
			if (i == 0) {
				dragging.position.z= z;
			} else {
				let o= dragging.sw.offsets[i-1];
				let p0= dragging.sw.points[0];
				dragging.sw.grade= (z-p0.position.z)/o.x;
			}
		} else {
			dragging.position.z= z;
		}
		dragging.calcElevation= false;
		calcTrack();
		renderCanvas();
	}
}

//	handle mouse up event in profile canvas
//	stop dragging
let profileMouseUp= function(event)
{
	dragging= null;
	renderCanvas();
}

//	draw display in profile canvas
//	mostly draws selected track with its control points
let renderProfile= function()
{
	let canvas= document.getElementById("profilecanvas");
	let width= canvas.width;
	let height= canvas.height;
	let context= canvas.getContext("2d");
	context.clearRect(0,0,canvas.width,canvas.height);
	if (!selected)
		return;
	if (!dragging) {
		centerE= selected.position.z;
		centerD= selected.distance;
		calcProfileOffset();
	}
	console.log("center "+centerD+" "+centerE);
	let controlPoints= selectedTrack.controlPoints;
	let groundPoints= selectedTrack.groundPoints;
	context.strokeWidth= 1;
	if (groundPoints.length > 3) {
		context.strokeStyle= "orange";
		context.beginPath();
		for (let i=1; i<groundPoints.length-1; i++) {
			let gp= groundPoints[i];
			let u= (gp.dist-centerD)*scale + width/2;
			let v= height/2 - (gp.elev1-centerE)*scale*10;
			if (i == 1)
				context.moveTo(u,v);
			else
				context.lineTo(u,v);
		}
		context.stroke();
		context.strokeStyle= "darkorange";
		context.beginPath();
		for (let i=1; i<groundPoints.length-1; i++) {
			let gp= groundPoints[i];
			let u= (gp.dist-centerD)*scale + width/2;
			let v= height/2 - (gp.elev2-centerE)*scale*10;
			if (i == 1)
				context.moveTo(u,v);
			else
				context.lineTo(u,v);
		}
		context.stroke();
	}
	context.strokeStyle= "brown";
	context.beginPath();
	for (let i=0; i<groundPoints.length; i++) {
		let gp= groundPoints[i];
		let u= (gp.dist-centerD)*scale + width/2;
		let v= height/2 - (gp.elev-centerE)*scale*10;
		if (i == 0)
			context.moveTo(u,v);
		else
			context.lineTo(u,v);
	}
	if (groundPoints.length==1) {
		let gp= groundPoints[i];
		let u= (gp.dist-centerD+10)*scale + width/2;
		let v= height/2 - (gp.elev-centerE)*scale*10;
		context.lineTo(u,v);
	}
	context.stroke();
	for (let j=0; j<tracks.length; j++) {
		let track= tracks[j];
		if (track.profileSign == 0)
			continue;
		if (track == selectedTrack)
			context.strokeStyle= "blue";
		else
			context.strokeStyle= "gray";
		let pSign= track.profileSign;
		let pOffset= track.profileOffset;
		let controlPoints= track.controlPoints;
		context.beginPath();
		for (let i=0; i<controlPoints.length; i++) {
			let cp= controlPoints[i];
			if (i > 0) {
				let trackGrade= controlPoints[i-1].trackGrade;
				let offset= -.5*cp.gradeChangeDist*
				  (cp.cpGrade-trackGrade);
				for (let j=5; j>0; j--) {
					let x= 1 - .2*j;
					let dd= .2*j*cp.gradeChangeDist;
					let dz= (1-x*x)*offset -
					  .2*j*cp.gradeChangeDist*trackGrade;
					let u= (pSign*(cp.distance-dd)+pOffset
					  -centerD)*scale + width/2;
					let v= height/2 -
					  (cp.position.z+dz-centerE)*scale*10;
					context.lineTo(u,v);
				}
			}
			let u= (pSign*cp.distance+pOffset-centerD)*scale +
			  width/2;
			let v= height/2 - (cp.position.z-centerE)*scale*10;
			if (i == 0)
				context.moveTo(u,v);
			else
				context.lineTo(u,v);
			if (i < controlPoints.length-1) {
				let offset= -.5*cp.gradeChangeDist*
				  (cp.trackGrade-cp.cpGrade);
				for (let j=1; j<=5; j++) {
					let x= 1 - .2*j;
					let dd= .2*j*cp.gradeChangeDist;
					let dz= (1-x*x)*offset +
					  .2*j*cp.gradeChangeDist*cp.trackGrade;
					let u= (pSign*(cp.distance+dd)+
					  pOffset-centerD)*scale + width/2;
					let v= height/2 -
					  (cp.position.z+dz-centerE)*scale*10;
					context.lineTo(u,v);
				}
			}
		}
		context.stroke();
	}
	controlPoints= selectedTrack.controlPoints;
	let drawSwitch= function(i)
	{
		let cp= controlPoints[i];
		if (cp.sw) {
			let j= cp.sw.points.indexOf(cp);
			let cp2= cp.sw.points[j==0?1:0];
			let d= cp.position.distanceTo(cp2.position);
			if (i != 0)
				d*= -1;
			context.beginPath();
			let u= (cp.distance-centerD)*scale + width/2;
			let v= height/2 - (cp.position.z-centerE)*scale*10;
			context.moveTo(u,v);
			u= (cp.distance-d-centerD)*scale + width/2;
			v= height/2 - (cp2.position.z-centerE)*scale*10;
			context.lineTo(u,v);
			context.stroke();
			context.fillStyle= "black";
			context.textAlign= "center";
			let g= 100*cp.sw.grade;
			u= (cp.distance-d/2-centerD)*scale + width/2;
			context.fillText(g.toFixed(1)+"%",u,height-15);
		}
	}
	drawSwitch(0);
	drawSwitch(controlPoints.length-1);
	for (let i=0; i<controlPoints.length; i++) {
		let cp= controlPoints[i];
		let u= (cp.distance-centerD)*scale + width/2;
		let v= height/2 - (cp.position.z-centerE)*scale*10;
		if (cp == selected)
			context.fillStyle= "red";
		else
			context.fillStyle= "blue";
		context.fillRect(u-3,v-3,6,6);
		context.fillStyle= "black";
		context.textAlign= "center";
		context.fillText((cp.position.z*3.281).toFixed(1),u,height-5);
	}
	context.fillStyle= "black";
	context.textAlign= "center";
	for (let i=0; i<controlPoints.length-1; i++) {
		let cp1= controlPoints[i];
		let cp2= controlPoints[i+1];
		let d= cp2.distance - cp1.distance;
		let dz= cp2.position.z - cp1.position.z;
		let g= 100*dz/Math.sqrt(d*d+dz*dz);
		g= 100*cp1.trackGrade;
		let u= (.5*(cp1.distance+cp2.distance)-centerD)*scale +
		  width/2;
		context.fillText(g.toFixed(1)+"%",u,height-10);
	}
}

//	calculate horizontal offset used to display other tracks in the
//	profile display in the proper relative position compared to the
//	selected track
let calcProfileOffset= function()
{
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		track.profileOffset= 0;
		track.profileSign= 0;
	}
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		sw.profileOffset= 0;
		sw.profileSign= 0;
	}
	selectedTrack.profileSign= 1;
	let addSwitch= function(track,index) {
		let cp= track.controlPoints[index];
		if (cp.sw && cp.sw.profileSign==0) {
			let j= cp.sw.points.indexOf(cp);
			let cp2= cp.sw.points[j==0?1:0];
			let d= cp.position.distanceTo(cp2.position);
			if (index==0 && j==0) {
				cp.sw.profileOffset= track.profileOffset;
				cp.sw.profileSign= -track.profileSign;
			} else if (index == 0) {
				cp.sw.profileOffset= track.profileOffset -
				  d*track.profileSign;
				cp.sw.profileSign= track.profileSign;
			} else if (j == 0) {
				cp.sw.profileOffset= track.profileOffset +
				  track.profileSign*cp.distance;;
				cp.sw.profileSign= track.profileSign;
			} else {
				cp.sw.profileOffset= track.profileOffset +
				  d*track.profileSign +
				  track.profileSign*cp.distance;;
				cp.sw.profileSign= -track.profileSign;
			}
//			console.log("addswtch "+cp.sw.profileSign+" "+
//			  cp.sw.profileOffset+" "+index+" "+j);
		}
	}
	let addTrack= function(track,index,chkDir) {
		if (track.profileSign)
			return;
		let cp= track.controlPoints[index];
		let sw= cp.sw;
		if (sw && sw.profileSign) {
			let j= sw.points.indexOf(cp);
			if (chkDir && sw.profileOffset<=0 &&
			  sw.profileSign<0 && j==0)
				return;
			if (chkDir && sw.profileOffset<=0 &&
			  sw.profileSign>0 && j!=0)
				return;
			if (chkDir && sw.profileOffset>0 &&
			  sw.profileSign<0 && j!=0)
				return;
			if (chkDir && sw.profileOffset>0 &&
			  sw.profileSign>0 && j==0)
				return;
			let cp2= sw.points[j==0?1:0];
			let d= cp.position.distanceTo(cp2.position);
			if (index==0 && j==0) {
				track.profileOffset= sw.profileOffset;
				track.profileSign= -sw.profileSign;
				addSwitch(track,track.controlPoints.length-1);
			} else if (index == 0) {
				track.profileOffset= sw.profileOffset +
				  d*sw.profileSign;
				track.profileSign= sw.profileSign;
				addSwitch(track,track.controlPoints.length-1);
			} else if (j == 0) {
				track.profileOffset= sw.profileOffset -
				  sw.profileSign*cp.distance;;
				track.profileSign= sw.profileSign;
				addSwitch(track,0);
			} else {
				track.profileOffset= sw.profileOffset +
				  d*sw.profileSign +
				  sw.profileSign*cp.distance;;
				track.profileSign= -sw.profileSign;
				addSwitch(track,0);
			}
//			console.log("addtrack "+track.controlPoints.length+" "+
//			  cp.distance+" "+
//			  track.profileSign+" "+
//			  track.profileOffset+" "+index+" "+j+" "+
//			  sw.profileOffset);
		}
	}
	let n= selectedTrack.controlPoints.length;
//	console.log("selectedTrack "+n+" "+
//	  selectedTrack.controlPoints[n-1].distance);
	addSwitch(selectedTrack,0);
	addSwitch(selectedTrack,selectedTrack.controlPoints.length-1);
	for (let iter=0; iter<8; iter++) {
		for (let i=0; i<tracks.length; i++) {
			let track= tracks[i];
			addTrack(track,0,i>4);
			addTrack(track,track.controlPoints.length-1,i>4);
		}
	}
}
