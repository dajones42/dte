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

//	interrupted Goode Homolosine map projection
//	proj4js doesn't appear to support +proj=igh
//	forward and inverse functions should work like proj4js

let ighProj= (function()
{
	let radius= 6370997;	// earth radius for igh
	let latThreshold= .710987989993; // latitude 40 44' 11.8"
	let centerLong= [	// center longitude by region
		-100*Math.PI/180,
		-100*Math.PI/180,
		30*Math.PI/180,
		30*Math.PI/180,
		-160*Math.PI/180,
		-60*Math.PI/180,
		-160*Math.PI/180,
		-60*Math.PI/180,
		20*Math.PI/180,
		140*Math.PI/180,
		20*Math.PI/180,
		140*Math.PI/180
	];
	// adjust longitude to be in range -PI to PI
	let adjLong= function(lng) {
		return Math.abs(lng)<Math.PI ? lng : lng-(lng<0?-1:1)*2*Math.PI;
	};
	// returns region number given latitude and longitude in radians
	let getRegion= function(lat,lng) {
		if (lat >= latThreshold) {
			if (lng <= -40*Math.PI/180)
				return 0;
			else
				return 2;
		} else if (lat >= 0) {
			if (lng <= -40*Math.PI/180)
				return 1;
			else
				return 3;
		} else if (lat >= -latThreshold) {
			if (lng <= -100*Math.PI/180)
				return 4;
			else if (lng <= -20*Math.PI/180)
				return 5;
			else if (lng <= 80*Math.PI/180)
				return 8;
			else
				return 9;
		} else {
			if (lng <= -100*Math.PI/180)
				return 6;
			else if (lng <= -20*Math.PI/180)
				return 7;
			else if (lng <= 80*Math.PI/180)
				return 10;
			else
				return 11;
		}
	};
	// convert lat/long in degrees (y&x) to x and y
	let forward= function(ll) {
		let lat= ll.y*Math.PI/180;
		let lng= ll.x*Math.PI/180;
		let region= getRegion(lat,lng);
		let center= centerLong[region];
		let falseEasting= radius*center;
		switch (region) {
		 case 1:
		 case 3:
		 case 4:
		 case 5:
		 case 8:
		 case 9:
			return {
				x: falseEasting +
				  radius*adjLong(lng-center)*Math.cos(lat),
				y: radius*lat
			};
			break;
		 default:
			let theta= lat;
			for (let i=0; i<30; i++) {
				let dtheta= -(theta + Math.sin(theta) -
				  Math.PI*Math.sin(lat)) / (1+Math.cos(theta));
				theta+= dtheta;
				if (Math.abs(dtheta) < 1e-10)
					break;
			}
			theta/= 2;
			return {
				x: falseEasting + radius*adjLong(lng-center)*
				  .900316316158*Math.cos(theta),
				y: radius*(Math.sqrt(2)*Math.sin(theta)-
				  .0528035274542*(lat<0?-1:1))
			};
			break;
		}
	};
	// convert x&y to latitude and longitude in degrees
	let inverse= function(xy) {
		let x= xy.x;
		let y= xy.y;
		let lat= y/radius;
		let lng= x/radius;
		let region= getRegion(lat,lng);
		let center= centerLong[region];
		let falseEasting= radius*center;
		x-= falseEasting;
		switch (region) {
		 case 1:
		 case 3:
		 case 4:
		 case 5:
		 case 8:
		 case 9:
			lat= y/radius;
			if (lat > Math.PI/2)
				return null;
			lng= Math.abs(lat-Math.PI/2)>1e-10 ?
			  adjLong(center+x/(radius*Math.cos(lat))) : center;
			return { x: lng*180/Math.PI, y: lat*180/Math.PI };
			break;
		 default:
			let a= (y+.0528035274542*radius*(y<0?-1:1)) /
			  (Math.sqrt(2)*radius);
			if (Math.abs(a) > 1)
				return null;
			let theta= Math.asin(a);
			lng= center +
			  (x/(.900316316158*radius*Math.cos(theta)));
			if (lng < -Math.PI)
				return null;
			a= (2*theta + Math.sin(2*theta))/Math.PI;
			if (Math.abs(a) > 1)
				return null;
			lat= Math.asin(a);
			return { x: lng*180/Math.PI, y: lat*180/Math.PI };
			break;
		}
	};
	return { forward: forward, inverse: inverse };
})();
