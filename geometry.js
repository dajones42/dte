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

//	miscellaneous geometry related functions

//	returns square of distance between a point and a line segment in 2D
let lineSegDistSq= function(x,y,x1,y1,x2,y2)
{
	var dx= x2-x1;
	var dy= y2-y1;
	var d= dx*dx + dy*dy;
	var n= dx*(x-x1) + dy*(y-y1);
	if (d==0 || n<=0) {
		dx= x1-x;
		dy= y1-y;
	} else if (n >= d) {
		dx= x2-x;
		dy= y2-y;
	} else {
		dx= x1 + dx*n/d - x;
		dy= y1 + dy*n/d - y;
	}
	return dx*dx + dy*dy;
}

//	returns point on a line segment in 2D that is closet to another point
let lineSegNearest= function(x,y,x1,y1,x2,y2)
{
	var dx= x2-x1;
	var dy= y2-y1;
	var d= dx*dx + dy*dy;
	var n= dx*(x-x1) + dy*(y-y1);
//	var debug= document.getElementById("debug");
//	debug.innerHTML= "<p>"+x1+" "+x2+" "+y1+" "+y2+" "+
//	  dx+" "+dy+" "+d+" "+n+"</p>";
	if (d==0 || n<=0)
		return { x: x1, y: y1 };
	else if (n >= d)
		return { x: x2, y: y2 };
	else
		return { x: x1 + dx*n/d, y: y1 + dy*n/d };
}

//	returns point on a line in 2D that is closet to another point
let lineNearest= function(x,y,x1,y1,x2,y2)
{
	var dx= x2-x1;
	var dy= y2-y1;
	var d= dx*dx + dy*dy;
	var n= dx*(x-x1) + dy*(y-y1);
//	var debug= document.getElementById("debug");
//	debug.innerHTML= "<p>"+x1+" "+x2+" "+y1+" "+y2+" "+
//	  dx+" "+dy+" "+d+" "+n+"</p>";
	if (d==0)
		d= 2*n;
	return { x: x1 + dx*n/d, y: y1 + dy*n/d };
}

//	returns twice the area of a triangle
//	positive if the points are listed in clockwise order, else negative
let triArea= function(x1,y1,x2,y2,x3,y3)
{
	return (x2-x1)*(y3-y1) - (x3-x1)*(y2-y1);
}

//	finds the intersection between two line segments a-b and c-d.
//	if result.d==0 the lines are parallel or collinear.
//	if 0<=result.s<=1 the intersection is on segment a-b.
//	if 0<=result.t<=1 the intersection is on segment c-d.
let segSegInt= function(a,b,c,d)
{
	var result= {};
	result.d= a.x*(d.y-c.y) + b.x*(c.y-d.y) + c.x*(a.y-b.y) + d.x*(b.y-a.y);
	if (result.d == 0)
		return result;
	result.s= (a.x*(d.y-c.y) + c.x*(a.y-d.y) + d.x*(c.y-a.y)) / result.d;
	result.t= -(a.x*(c.y-b.y) + b.x*(a.y-c.y) + c.x*(b.y-a.y)) / result.d;
	result.x= a.x + result.s*(b.x-a.x);
	result.y= a.y + result.s*(b.y-a.y);
	return result;
}

//	calculates the average of two angles
//	weighted average if w1 and w2 are defined
let angleAverage= function(a1,a2,w1,w2)
{
	if (!w1 || !w2) {
		w1= .5;
		w2= .5;
	}
	if ((a1>a2 && a1-a2>Math.PI) || (a2>a1 && a2-a1>Math.PI))
		return w1*a1+w2*a2+Math.PI;
	else
		return w1*a1+w2*a2;
}
//	adds two angles and returns a result between PI and -PI
let addAngles= function(a1,a2)
{
	var a= a1+a2;
	if (a < -Math.PI)
		a+= 2*Math.PI;
	if (a > Math.PI)
		a-= 2*Math.PI;
	return a;
}

//	returns the distance between two points
let distance= function(p1,p2) {
	var dx= p2.x-p1.x;
	var dy= p2.y-p1.y;
	return Math.sqrt(dx*dx+dy*dy);
}

//	Returns the center and radius of a circle fit to three or more points.
//	Uses the modified least squares method from A Few Methods for Fitting
//	Circles to Data, by D. Umbach and K. Jones.
let fitCircle= function(xy)
{
	var n= xy.length;
	if (n < 3)
		return null;
	var sx= 0;
	var sy= 0;
	var sxx= 0;
	var syy= 0;
	var sxy= 0;
	var sxxy= 0;
	var sxyy= 0;
	var sxxx= 0;
	var syyy= 0;
	for (var i=0; i<n; i++) {
		var x= xy[i].x;
		var y= xy[i].y;
		sx+= x;
		sy+= y;
		sxx+= x*x;
		syy+= y*y;
		sxy+= x*y;
		sxxy+= x*x*y;
		sxyy+= x*y*y;
		sxxx+= x*x*x;
		syyy+= y*y*y;
	}
	var a= n*sxx-sx*sx;
	var b= n*sxy-sx*sy;
	var c= n*syy-sy*sy;
	var d= .5*(n*sxyy - sx*syy + n*sxxx - sx*sxx);
	var e= .5*(n*sxxy - sy*sxx + n*syyy - sy*syy);
	var cx= (d*c-b*e)/(a*c-b*b);
	var cy= (a*e-b*d)/(a*c-b*b);
	var sr= 0;
	var srr= 0;
	for (var i=0; i<n; i++) {
		var x= xy[i].x-cx;
		var y= xy[i].y-cy;
		var r= Math.sqrt(x*x+y*y);
		sr+= r;
		srr+= r*r;
	}
	return { x: cx, y: cy, r: sr/n, e: srr-sr*sr/n, n: n };
}

//	returns curvature in degrees given radius in meters
let radius2deg= function(r)
{
	return Math.asin(50/3.281/r)*360/Math.PI;
}

//	Returns the center and direction of a line fit to two or more points
//	using orthoganal least squares.
let fitLine= function(xy)
{
	var n= xy.length;
	if (n < 2)
		return null;
	var cx= 0;
	var cy= 0;
	for (var i=0; i<n; i++) {
		cx+= xy[i].x;
		cy+= xy[i].y;
	}
	cx/= n;
	cy/= n;
	var a= 0;
	var b= 0;
	var c= 0;
	for (var i=0; i<n; i++) {
		var dx= xy[i].x-cx;
		var dy= xy[i].y-cy;
		a+= dy*dy;
		b-= dx*dy;
		c+= dx*dx;
	}
	var d= Math.sqrt((a-c)*(a-c)+4*b*b);
	var sx= 2*b;
	var sy= c-a-d;
	var len= Math.sqrt(sx*sx+sy*sy);
	sx/= len;
	sy/= len;
	var e= 0;
	for (var i=0; i<n; i++) {
		var dx= xy[i].x-cx;
		var dy= xy[i].y-cy;
		var len= Math.sqrt(dx*dx+dy*dy);
		var err= lineSegDistSq(xy[i].x,xy[i].y,
		  cx-len*sx,cy-len*sy,cx+len*sx,cy+len*sy);
		e+= err;
//		console.debug(" "+i+" "+xy[i].x+" "+xy[i].y+" "+
//		  dx+" "+dy+" "+len+" "+err+" "+Math.sqrt(err)+
//		  " "+dx/len+" "+dy/len);
	}
	return { x: cx, y: cy, sx: sx, sy: sy, e: e };
}

//	returns a line to connect two circles
let circleCircleLine= function(c1,c2)
{
	var d= distance(c1,c2);
	if (d == 0)
		return null;
	var dx= c2.x - c1.x;
	var dy= c2.y - c1.y;
//	console.log("ccl "+d+" "+c1.r+" "+c2.r+" "+c1.cw+" "+c2.cw+" "+
//	  dx+" "+dy);
	var rotateLine= function(u1,v1,u2,v2) {
		var dx= c2.x - c1.x;
		var dy= c2.y - c1.y;
		var cs= dx/d;
		var sn= dy/d;
//		console.log(" rl "+u1+" "+v1+" "+u2+" "+v2+" "+cs+" "+sn);
		return {
		 p1: { x: c1.x + u1*cs - v1*sn, y: c1.y + u1*sn + v1*cs },
		 p2: { x: c1.x + u2*cs - v2*sn, y: c1.y + u2*sn + v2*cs } };
	};
	if (c1.cw == c2.cw) {
		if (d+c1.r<=c2.r || d+c2.r<=c1.r)
			return null;
		var cs= 1;
		var sn= 0;
		for (var i=0; i<10; i++) {
			var dx= d + sn*(c1.r-c2.r);
			var dy= cs*(c2.r-c1.r);
			var dd= Math.sqrt(dx*dx+dy*dy);
			cs= dx/dd;
			sn= dy/dd;
		}
		if (!c1.cw) {
//			sn*= -1;
			cs*= -1;
		}
//		console.log(" same "+cs+" "+sn);
		return rotateLine(-sn*c1.r,cs*c1.r,d-sn*c2.r,cs*c2.r);
	} else {
		var r= c1.r + c2.r;
		if (r >= d)
			return rotateLine(c1.r,0,c1.r,0);
		var sn= r/d;
		var cs= Math.sqrt(1-sn*sn);
		if (c1.cw)
			cs*= -1;
//		console.log(" diff "+cs+" "+sn);
		return rotateLine(sn*c1.r,-cs*c1.r,d-sn*c2.r,cs*c2.r);
	}
}
