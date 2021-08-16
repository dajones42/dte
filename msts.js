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

//	MSTS file related code

const fs= require('fs');

const fspath= require('path');

//const CSG= require('@jscad/csg');

let mstsDir= null;	// full path to MSTS directory
let routeDir= null;	// full path to route directory
let tdbPath= null;	// full path to TDB file
let tiles= [];		// tiles in route

//	read all of the .t files in the specified route's TILES directory.
let readTiles= function(routePath)
{
	if (!routePath)
		routePath= routeDir;
	let tilesPath= routePath+fspath.sep+'TILES';
	let files= fs.readdirSync(tilesPath);
	for (let i=0; i<files.length; i++) {
		if (files[i].substr(files[i].length-2) != ".t")
			continue;
//		console.log(' '+files[i]);
		let tile= tFileToXZ(files[i]);
		let path= tilesPath+fspath.sep+files[i];
		readTFile(path,tile);
//		console.log(' '+tile.x+" "+tile.z+" "+
//		  tile.floor+" "+tile.scale+" "+tile.filename);
		tiles.push(tile);
	}
}

//	reads a single .t file and saves the terrain scale and floor.
let readTFile= function(path,tile)
{
	const fd= fs.openSync(path,"r");
	if (!fd)
		throw 'cannot open file '+filename;
	const magic= Buffer.alloc(16);
	fs.readSync(fd,magic,0,16);
//	console.log("tfile "+path+" "+magic.toString("ascii",0,6)+" "+
//	  magic.toString("ascii",7,1));
	const buf= Buffer.alloc(4);
	// read a single 4 byte int from file
	let readInt= function()
	{
		let n= fs.readSync(fd,buf,0,4);
		if (n < 4)
			return 0;
		return buf.readInt32LE(0);
	}
	// read a single 4 byte float from file
	let readFloat= function()
	{
		let n= fs.readSync(fd,buf,0,4);
		if (n < 4)
			return 0;
		return buf.readFloatLE(0);
	}
	// read a single 1 byte int from file
	let readByte= function()
	{
		let n= fs.readSync(fd,buf,0,1);
		if (n < 1)
			return 0;
		return buf.readUInt8(0);
	}
	// ignore n bytes in file
	let skip= function(n)
	{
		for (let i=0; i<n; i++)
			if (fs.readSync(fd,buf,0,1) != 1)
				return;
	}
	skip(16);
	for (;;) {
		let code= readInt();
		let len= readInt();
		if (code == 0)
			break;
		switch (code) {
		 case 136: // terrain
		 case 139: // terrain_samples
			skip(readByte());
			break;
		 case 142: // terrain sample floor
			skip(readByte());
			tile.floor= readFloat();
			break;
		 case 143: // terrain sample scale
			skip(readByte());
			tile.scale= readFloat();
			break;
		 case 137: // terrain errthreshold_scale
		 case 138: // terrain always select maxdist
		 case 140: // terrain nsamples
		 case 141: // terrain sample rotation
		 case 144: // terrain sample size
		 case 146: // terrain sample ybuffer
		 case 147: // terrain sample ebuffer
		 case 148: // terrain sample nbuffer
		 case 151: // terrain shaders
		 case 157: // terrain patches
		 case 251: // water level
		 case 281: // ??
			skip(len);
			break;
		 default:
//			console.log("code "+code+" "+len);
			skip(len);
			break;
		}
	}
	fs.closeSync(fd);
}

//	returns tile x and z coordinates extracted from .t file name.
let tFileToXZ= function(name)
{
	let x= 0;
	let z= 0;
	let hexdigit= [
		'0','1','4','5',
		'3','2','7','6',
		'c','d','8','9',
		'f','e','b','a'
	];
	for (let i=1; i<9; i++) {
		let j= 0;
		for (; j<16; j++)
			if (name.substr(i,1)==hexdigit[j])
				break;
		let s= 16-2*i;
		let m= 3<<s;
		x|= (j&3)<<s;
		z|= ((j&0xc)>>2)<<s;
	}
	x>>= 1;
	z>>= 1;
	return { filename: name.substr(0,name.length-2),
	  x: x-16384, z: 16384-z-1 };
}

//	reads a tile's elevation data from the y.raw file.
let readTerrain= function(tile)
{
	if (tile.terrain)
		return;
	let size= 256*256*2;
	tile.terrain= Buffer.alloc(size);
	let path= routeDir+fspath.sep+"TILES"+fspath.sep+tile.filename+"_y.raw";
	let fd= fs.openSync(path,"r");
	if (!fd)
		throw 'cannot open file '+path;
	fs.readSync(fd,tile.terrain,0,size);
	fs.closeSync(fd);
	tile.origTerrain= Buffer.from(tile.terrain);
	path= routeDir+fspath.sep+"TILES"+fspath.sep+tile.filename+
	  "_y.orig";
	if (fs.existsSync(path)) {
		fd= fs.openSync(path,"r");
		if (!fd)
			throw 'cannot open file '+path;
		fs.readSync(fd,tile.origTerrain,0,size);
		fs.closeSync(fd);
	} else {
		fd= fs.openSync(path,"w");
		if (!fd)
			throw 'cannot create file '+path;
		fs.writeSync(fd,tile.origTerrain,0,size);
		fs.closeSync(fd);
	}
}

//	saves a tile's elevation data to the y.raw file.
let writeTerrain= function(tile)
{
	if (!tile.terrain)
		return;
	let size= 256*256*2;
	let path= routeDir+fspath.sep+"TILES"+fspath.sep+tile.filename+"_y.raw";
	const fd= fs.openSync(path,"w");
	if (!fd)
		throw 'cannot create file '+path;
	fs.writeSync(fd,tile.terrain,0,size);
	fs.closeSync(fd);
}

//	saves a tile's terrain flags to the f.raw file.
let writeTerrainFlags= function(tile)
{
	if (!tile.patchModels)
		return;
	let size= 256*256;
	let flags= Buffer.alloc(size);
	for (let i=0; i<size; i++)
		flags.writeUInt8(0,i);
	for (let i=0; i<tile.patchModels.length; i++) {
		let tpm= tile.patchModels[i];
		for (let j=1; j<16; j++) {
			for (let k=1; k<16; k++) {
				flags.writeUInt8(4,(tpm[0]+j)*256+tpm[1]+k);
			}
		}
	}
	let path= routeDir+fspath.sep+"TILES"+fspath.sep+tile.filename+"_f.raw";
	const fd= fs.openSync(path,"w");
	if (!fd)
		throw 'cannot create file '+path;
	fs.writeSync(fd,flags,0,size);
	fs.closeSync(fd);
}

//	reads an MSTS unicode SIMISA text file and returns a tree of values and
//	children arrays.
let readFile= function(path)
{
	let root= { value: null, children: [] };
	let fd;
	try {
		fd= fs.openSync(path,"r");
		if (!fd) {
//			console.error('cannot open file '+path);
			return null;
		}
	} catch (e) {
//		console.error('cannot open file '+path);
		return null;
	}
	const buf= Buffer.alloc(2);
	fs.readSync(fd,buf,0,2);
	let littleEndian= buf[0]==0xff;
	// reads a single unicode character in file
	let getChar= function()
	{
		let n= fs.readSync(fd,buf,0,2);
		if (n < 2)
			return "";
		if (littleEndian) {
			return String.fromCharCode(buf[0]+256*buf[1]);
		} else {
			return String.fromCharCode(buf[1]+256*buf[0]);
		}
	}
	let savedC= null;
	// reads a token worth of chars from file
	let getToken= function()
	{
		let token= "";
		if (savedC) {
			token= savedC;
			savedC= null;
			return token;
		}
		let c= "";
		for (;;) {
			c= getChar();
			if (c.length != 1)
				return token;
			if (c!=' ' && c!='\t' && c!='\n' && c!='\r')
				break;
		}
		if (c=='(' || c==')') {
			token= c;
		} else if (c == '"') {
			for (c=getChar(); c!='"'; c=getChar()) {
				if (c == '\\') {
					c= getChar();
					if (c == 'n')
						c= '\n';
				}
				token+= c;
			}
		} else {
			while (c!=' ' && c!='\t' && c!='\n' && c!='\r') {
				if (c=='(' || c==')') {
					savedC= c;
					break;
				}
				token+= c;
				c= getChar();
			}
		}
		return token;
	}
	// reads a list of tokens terminated by a ).
	// calls self recursively to handle sublists.
	let parseList= function(parent)
	{
		for (let token=getToken(); token.length>0; token=getToken()) {
			if (token == ")")
				return;
			let node= { value: null, children: [] };
			parent.children.push(node);
			if (token == "(")
				parseList(node);
			else
				node.value= token;
		}
	}
	let token= getToken();
	if (token.substr(0,6) != "SIMISA") {
		fs.close(fd);
		throw "file heading not found";
	}
	for (let token=getToken(); token.length>0; token=getToken()) {
		let node= { value: null, children: [] };
		root.children.push(node);
		if (token == "(")
			parseList(node);
		else
			node.value= token;
	}
	fs.closeSync(fd);
	return root;
}

//	reads global and route tsection.dat files and saves arrays of
//	shapes, sections and track paths.
let readTSection= function(routePath)
{
	let mstsDir= fspath.dirname(fspath.dirname(routePath));
	let path= mstsDir+fspath.sep+"GLOBAL"+fspath.sep+'tsection.dat';
	let gts= readFile(path);
	let result= { shapes: [], sections: [], trackPaths: [] };
	// saves track shape path information from a file node.
	let makePath= function(node)
	{
		let n= parseInt(node.children[0].value);
		let path= {
			start: [
				parseFloat(node.children[1].value),
				parseFloat(node.children[2].value),
				parseFloat(node.children[3].value)
			],
			angle: parseFloat(node.children[4].value),
			sections: []
		};
		for (let i=0; i<n; i++) {
			path.sections.push(parseInt(node.children[i+5].value));
		}
		return path;
	}
	// saves track shape information from a file node.
	let saveTrackShape= function(node)
	{
		let shape= { paths: [] };
		for (let i=0; i<node.children.length; i++) {
			let c= node.children[i];
			if (c.value=="FileName") {
				shape.filename= node.
				  children[i+1].children[0].value;
			} else if (c.value=="SectionIdx") {
				shape.paths.push(makePath(node.children[i+1]));
			} else if (c.value=="MainRoute") {
				shape.mainRoute= parseInt(node.
				  children[i+1].children[0].value);
			}
		}
		let index= parseInt(node.children[0].value);
		result.shapes[index]= shape;
	}
	// saves track section information from a file node.
	let saveTrackSection= function(node)
	{
		let section= {};
		for (let i=0; i<node.children.length; i++) {
			let c= node.children[i];
			if (c.value=="SectionSize") {
				section.length= parseFloat(node.
				  children[i+1].children[1].value);
			} else if (c.value=="SectionCurve") {
				section.radius= parseFloat(node.
				  children[i+1].children[0].value);
				section.angle= parseFloat(node.
				  children[i+1].children[1].value);
			}
		}
		let index= parseInt(node.children[0].value);
		result.sections[index]= section;
	}
	// saves track section information from a route tsection file node.
	let saveRTrackSection= function(node)
	{
		let section= { dynTrack: true };
		let radius= parseFloat(node.children[4].value);
		if (radius == 0) {
			section.length= parseFloat(node.children[3].value);
		} else {
			section.radius= radius;
			section.angle= 180/Math.PI*
			  parseFloat(node.children[3].value);
		}
		let index= parseInt(node.children[2].value);
		result.sections[index]= section;
	}
	// saves track path information from a route tsection file node.
	let saveRTrackPath= function(node)
	{
		let path= [];
		let n= parseInt(node.children[1].value);
		for (let i=0; i<n; i++)
			path.push(parseInt(node.children[i+2].value));
		let index= parseInt(node.children[0].value);
		result.trackPaths[index]= path;
	}
	for (let i=0; i<gts.children.length; i++) {
		let c= gts.children[i];
		if (c.value!="TrackShapes" && c.value!="TrackSections")
			continue;
		c= gts.children[i+1];
		for (let j=0; j<c.children.length; j++) {
			if (c.children[j].value=="TrackShape") {
				saveTrackShape(c.children[j+1]);
			} else if (c.children[j].value=="TrackSection") {
				saveTrackSection(c.children[j+1]);
			}
		}
	}
	path= routePath+fspath.sep+'tsection.dat';
	let rts= readFile(path);
	for (let i=0; i<rts.children.length; i++) {
		let c= rts.children[i];
		if (c.value!="TrackSections" && c.value!="SectionIdx")
			continue;
		c= rts.children[i+1];
		for (let j=0; j<c.children.length; j++) {
			if (c.children[j].value=="TrackSection") {
				saveRTrackSection(c.children[j+1]);
			}
			if (c.children[j].value=="TrackPath") {
				saveRTrackPath(c.children[j+1]);
			}
		}
	}
	return result;
}

//	reads a route's .tdb file and builds a list of track nodes.
let readTrackDB= function(path)
{
//	testQDir();
	tdbPath= path;
	routeDir= fspath.dirname(path);
	mstsDir= fspath.dirname(fspath.dirname(routeDir));
	let tSection= readTSection(routeDir);
	let result= { nodes: [], trItems: [], tSection: tSection };
	// saves end node information from a tdb file node.
	let parseEndNode= function(fnode,tnode)
	{
	}
	// saves junction node information from a tdb file node.
	let parseJunctionNode= function(fnode,tnode)
	{
		tnode.unk2= parseInt(fnode.children[0].value);//always zero?
		tnode.shape= parseInt(fnode.children[1].value);
		tnode.manual= parseInt(fnode.children[2].value);
	}
	// saves Uid information from a tdb file node.
	let parseUid= function(fnode,tnode)
	{
		tnode.wftx= parseInt(fnode.children[0].value);
		tnode.wftz= parseInt(fnode.children[1].value);
		tnode.wfuid= parseInt(fnode.children[2].value);
		tnode.unk= parseInt(fnode.children[3].value);
		tnode.tx= parseInt(fnode.children[4].value);
		tnode.tz= parseInt(fnode.children[5].value);
		tnode.x= parseFloat(fnode.children[6].value);
		tnode.y= parseFloat(fnode.children[7].value);
		tnode.z= parseFloat(fnode.children[8].value);
//		rotation angles
		tnode.ax= parseFloat(fnode.children[9].value);
		tnode.ay= parseFloat(fnode.children[10].value);
		tnode.az= parseFloat(fnode.children[11].value);
	}
	// saves vector section information from a tdb file node.
	let parseVectorSections= function(fnode)
	{
		let n= parseInt(fnode.children[0].value);
		let sections= [];
		for (let i=0; i<n; i++) {
			let section= {};
			let j= i*16+1;
			section.sectionID= parseInt(fnode.children[j].value);
			section.shapeID= parseInt(fnode.children[j+1].value);
			section.wftx= parseInt(fnode.children[j+2].value);
			section.wftz= parseInt(fnode.children[j+3].value);
			section.wfuid= parseInt(fnode.children[j+4].value);
			section.flag1= parseInt(fnode.children[j+5].value);
//			flag1==1 for first section and ==2 for flipped section?
			section.flag2= parseInt(fnode.children[j+6].value);
			section.flag3= fnode.children[j+7].value;
			section.tx= parseInt(fnode.children[j+8].value);
			section.tz= parseInt(fnode.children[j+9].value);
			section.x= parseFloat(fnode.children[j+10].value);
			section.y= parseFloat(fnode.children[j+11].value);
			section.z= parseFloat(fnode.children[j+12].value);
//			rotation angles
			section.ax= parseFloat(fnode.children[j+13].value);
			section.ay= parseFloat(fnode.children[j+14].value);
			section.az= parseFloat(fnode.children[j+15].value);
			sections[i]= section;
		}
		return sections;
	}
	// saves TrItemRef information from a tdb file node.
	let parseItemRefs= function(fnode)
	{
		let n= parseInt(fnode.children[0].value);
		let itemRefs= [];
		for (let i=1; i<fnode.children.length; i++) {
			if (fnode.children[i].value == "TrItemRef")
				itemRefs.push(parseInt(
				  fnode.children[i+1].children[0].value));
		}
		return itemRefs;
	}
	// saves track node pins information from a tdb file node.
	let parsePins= function(fnode)
	{
		let pins= [];
		for (let i=0; i<fnode.children.length; i++) {
			if (fnode.children[i].value == "TrPin") {
				let j= parseInt(
				  fnode.children[i+1].children[0].value);
				let end= parseInt(
				  fnode.children[i+1].children[1].value);
				pins.push({ node: j, end: end });
			}
		}
		return pins;
	}
	// saves track node information from a tdb file node.
	let saveTrackNode= function(fnode)
	{
		let index= parseInt(fnode.children[0].value);
		let tnode= { id: index };
		for (let i=0; i<fnode.children.length; i++) {
			if (fnode.children[i].value == "TrEndNode") {
				parseEndNode(fnode.children[i+1],tnode);
			} else if (fnode.children[i].value =="TrJunctionNode") {
				parseJunctionNode(fnode.children[i+1],tnode);
			} else if (fnode.children[i].value == "UiD") {
				parseUid(fnode.children[i+1],tnode);
			} else if (fnode.children[i].value == "TrVectorNode") {
				let c= fnode.children[i+1];
				tnode.sections=
				  parseVectorSections(c.children[1]);
				if (c.children.length>=4 &&
				  c.children[2].value=="TrItemRefs")
					tnode.itemRefs=
					  parseItemRefs(c.children[3]);
			} else if (fnode.children[i].value == "TrPins") {
				tnode.pins=
				  parsePins(fnode.children[i+1]);
			}
		}
		result.nodes[index]= tnode;
	}
	let tdb= readFile(path);
	if (tdb.children[0].value != "TrackDB")
		throw "bad TrackDB file "+path;
	tdb= tdb.children[1];
	for (let i=0; i<tdb.children.length; i++) {
		let c= tdb.children[i];
		if (c.value == "Serial") {
			c= tdb.children[i+1];
			result.serial= parseInt(c.children[0].value);
			continue;
		}
		if (c.value=="TrItemTable") {
			result.itemTable= tdb.children[i+1].children;
			continue;
		}
		if (c.value!="TrackNodes")
			continue;
		c= tdb.children[i+1];
		for (let j=0; j<c.children.length; j++) {
			if (c.children[j].value=="TrackNode") {
				saveTrackNode(c.children[j+1]);
			}
		}
	}
	return result;
}

//	finds and return a tile entry in the tiles array.
let findTile= function(tx,tz)
{
	for (let i=0; i<tiles.length; i++) {
		let tile= tiles[i];
		if (tile.x==tx && tile.z==tz)
			return tile;
	}
//	console.log("no tile "+tx+" "+tz);
	return null;
}

//	returns terrain elevation given tile and height field coordinates.
let getTerrainElevation= function(i,j,tile,orig)
{
	if (!tile.terrain)
		readTerrain(tile);
	let tdata= orig ? tile.origTerrain : tile.terrain;
	if (i<256 && j<256)
		return tile.floor + tile.scale*tdata.readUInt16LE((i*256+j)*2);
	if (i<256 && j>=256) {
		if (!tile.tile21)
			tile.tile21= findTile(tile.x+1,tile.z);
		if (tile.tile21 && !tile.tile21.terrain)
			readTerrain(tile.tile21);
		if (tile.tile21 && tile.tile21.terrain) {
			tdata= orig ? tile.tile21.origTerrain :
			  tile.tile21.terrain;
			return tile.tile21.floor + tile.tile21.scale*
			  tdata.readUInt16LE((i*256+j-256)*2);
		} else {
			return tile.floor +
			  tile.scale*tdata.readUInt16LE((i*256+255)*2);
		}
	}
	if (i>=256 && j<256) {
		if (!tile.tile12)
			tile.tile12= findTile(tile.x,tile.z-1);
		if (tile.tile12 && !tile.tile12.terrain)
			readTerrain(tile.tile12);
		if (tile.tile12 && tile.tile12.terrain) {
			tdata= orig ? tile.tile12.origTerrain :
			  tile.tile12.terrain;
			return tile.tile12.floor + tile.tile12.scale*
			  tdata.readUInt16LE(((i-256)*256+j)*2);
		} else {
			return tile.floor +
			  tile.scale*tdata.readUInt16LE((255*256+j)*2);
		}
	}
	if (i>=256 && j>=256) {
		if (!tile.tile22)
			tile.tile22= findTile(tile.x+1,tile.z-1);
		if (tile.tile22 && !tile.tile22.terrain)
			readTerrain(tile.tile22);
		if (tile.tile22 && tile.tile22.terrain) {
			tdata= orig ? tile.tile22.origTerrain :
			  tile.tile22.terrain;
			return tile.tile22.floor + tile.tile22.scale*
			  tdata.readUInt16LE(((i-256)*256+j-256)*2);
		} else {
			return tile.floor +
			  tile.scale*tdata.readUInt16LE((255*256+255)*2);
		}
	}
}

//	sets terrain elevation given tile and height field coordinates.
let setTerrainElevation= function(i,j,tile,elev,both)
{
	if (!tile.terrain) {
		readTerrain(tile);
		if (!tile.terrain)
			return;
	}
	if (i<256 && j<256) {
		let u= elev<=tile.floor ? 0 :
		  elev>=tile.floor*65535*tile.scale ? 65535 :
		  (elev-tile.floor)/tile.scale;
		tile.terrain.writeUInt16LE(u,(i*256+j)*2);
		if (both)
			tile.origTerrain.writeUInt16LE(u,(i*256+j)*2);
	}
	if (i<256 && j>=256) {
		if (!tile.tile21)
			tile.tile21= findTile(tile.x+1,tile.z);
		setTerrainElevation(i,j-256,tile.tile21,elev,both);
	}
	if (i>=256 && j<256) {
		if (!tile.tile12)
			tile.tile12= findTile(tile.x,tile.z-1);
		setTerrainElevation(i-256,j,tile.tile12,elev,both);
	}
	if (i>=256 && j>=256) {
		if (!tile.tile22)
			tile.tile22= findTile(tile.x+1,tile.z-1);
		setTerrainElevation(i-256,j-256,tile.tile22,elev,both);
	}
}

//	returns an interpolated terrain elevation given coordinates within tile.
let getTileElevation= function(tx,tz,x,z,orig)
{
	let j= Math.floor(x/8) + 128;
	let i= 128 - Math.floor(z/8);
	if (j < 0) {
		j+= 256;
		x+= 2048;
		tx-= 1;
	}
	if (i <= 0) {
		i+= 256;
		z-= 2048;
		tz+= 1;
	}
	let x0= 8*(j-128);
	let z0= 8*(128-i);
	let wx= (x-x0)/8;
	let wz= (z-z0)/8;
	let tile= findTile(tx,tz);
	if (!tile) {
		console.log("cant find "+tx+" "+tz);
		return 0;
	}
	let a00= getTerrainElevation(i,j,tile,orig);
	let a01= getTerrainElevation(i-1,j,tile,orig);
	let a11= getTerrainElevation(i-1,j+1,tile,orig);
	let a10= getTerrainElevation(i,j+1,tile,orig);
//	console.log(" gte "+wx+" "+wz+" "+x0+" "+z0+" "+i+" "+j);
//	console.log("  "+a00+" "+a10+" "+a11+" "+a01);
	return (1-wx)*(1-wz)*a00 + wx*(1-wz)*a10 + wx*wz*a11 + (1-wx)*wz*a01;
}

//	sets terrain elevation given coordinates within tile.
let setTileElevation= function(tx,tz,x,z,elev)
{
	let j= Math.floor(x/8) + 128;
	let i= 128 - Math.floor(z/8);
	if (j < 0) {
		j+= 256;
		x+= 2048;
		tx-= 1;
	}
	if (i <= 0) {
		i+= 256;
		z-= 2048;
		tz+= 1;
	}
	let x0= 8*(j-128);
	let z0= 8*(128-i);
	let wx= (x-x0)/8;
	let wz= (z-z0)/8;
	console.log("sette "+tx+" "+tz+" "+x+" "+z+" "+i+" "+j+" "+wx+" "+wz);
	let tile= findTile(tx,tz);
	if (!tile)
		return 0;
	if (wx<=.5 && wz<=.5)
		setTerrainElevation(i,j,tile,elev,false);
	if (wx<=.5 && wz>=.5)
		setTerrainElevation(i-1,j,tile,elev,false);
	if (wx>=.5 && wz>=.5)
		setTerrainElevation(i-1,j+1,tile,elev,false);
	if (wx>=.5 && wz<=.5)
		setTerrainElevation(i,j+1,tile,elev,false);
}

//	saves MSTS track data to a new TDB file.
let writeTrackDB= function(tdb)
{
//	let path= routeDir+fspath.sep+"new.tdb";
	const fd= fs.openSync(tdbPath,"w");
	const bom= Buffer.alloc(2);
	bom.writeUInt16LE(0xfeff,0);
	fs.writeSync(fd,bom,0,2);
	fs.writeSync(fd,"SIMISA@@@@@@@@@@JINX0T0t______\r\n",null,"utf16le");
	fs.writeSync(fd,"\r\n",null,"utf16le");
	fs.writeSync(fd,"TrackDB (\r\n",null,"utf16le");
	fs.writeSync(fd,"\tSerial ( "+tdb.serial+" )\r\n",null,"utf16le");
	fs.writeSync(fd,"\tTrackNodes ( "+(tdb.nodes.length-1)+"\r\n",
	  null,"utf16le");
	// writes track node pins information to tdb file
	let writePins= function(node,nodes) {
		fs.writeSync(fd,"\t\t\tTrPins ( 1 "+(node.pins.length-1)+
		  "\r\n",null,"utf16le");
		for (let i=0; i<node.pins.length; i++) {
			fs.writeSync(fd,"\t\t\t\tTrPin ( "+
			  node.pins[i].node+" "+
			  node.pins[i].end+" )\r\n",null,"utf16le");
		}
		fs.writeSync(fd,"\t\t\t)\r\n",null,"utf16le");
	}
	// writes track node item refs information to tdb file
	let writeItemRefs= function(node) {
		fs.writeSync(fd,"\t\t\t\tTrItemRefs ( "+node.itemRefs.length+
		  "\r\n",null,"utf16le");
		for (let i=0; i<node.itemRefs.length; i++) {
			fs.writeSync(fd,"\t\t\t\t\tTrItemRef ( "+
			  node.itemRefs[i]+" )\r\n",null,"utf16le");
		}
		fs.writeSync(fd,"\t\t\t\t)\r\n",null,"utf16le");
	}
	// writes track node Uid information to tdb file
	let writeUiD= function(node) {
		fs.writeSync(fd,"\t\t\tUiD ( "+node.wftx+" "+node.wftz+" "+
		  node.wfuid+" "+node.unk+" "+node.tx+" "+node.tz+" "+
		  node.x.toFixed(3)+" "+node.y.toFixed(3)+" "+
		  node.z.toFixed(3)+" "+node.ax.toFixed(5)+" "+
		  node.ay.toFixed(5)+" "+node.az.toFixed(5)+" )\r\n",
		  null,"utf16le");
	}
	// writes end node information to tdb file
	let writeEndNode= function(node) {
		fs.writeSync(fd,"\t\t\tTrEndNode ( 0 )\r\n",null,"utf16le");
	}
	// writes vector section information to tdb file
	let writeVectorSection= function(section) {
		fs.writeSync(fd," "+section.sectionID+" "+section.shapeID+" "+
		  section.wftx+" "+section.wftz+" "+
		  section.wfuid+" "+section.flag1+" "+
		  section.flag2+" "+section.flag3+" "+
		  section.tx+" "+section.tz+" "+
//		  section.x+" "+section.y+" "+
//		  section.z+" "+
//		  section.ax+" "+section.ay+" "+
//		  section.az,null,"utf16le");
		  section.x.toFixed(3)+" "+section.y.toFixed(3)+" "+
		  section.z.toFixed(3)+" "+
		  section.ax.toFixed(5)+" "+section.ay.toFixed(5)+" "+
		  section.az.toFixed(5)+"\r\n",null,"utf16le");
	}
	// writes vector section node information to tdb file
	let writeVectorNode= function(node) {
		fs.writeSync(fd,"\t\t\tTrVectorNode (\r\n",null,"utf16le");
		fs.writeSync(fd,"\t\t\t\tTrVectorSections ( "+
		  node.sections.length+"\r\n",null,"utf16le");
		for (let i=0; i<node.sections.length; i++) {
			writeVectorSection(node.sections[i]);
		}
		fs.writeSync(fd," )\r\n",null,"utf16le");
		if (node.itemRefs)
			writeItemRefs(node);
		fs.writeSync(fd,"\t\t\t)\r\n",null,"utf16le");
	}
	// writes junction node information to tdb file
	let writeJunctionNode= function(node) {
		fs.writeSync(fd,"\t\t\tTrJunctionNode ( "+node.unk2+" "+
		  node.shape+" "+node.manual+" )\r\n",null,"utf16le");
	}
	for (let i=1; i<tdb.nodes.length; i++) {
		let node= tdb.nodes[i];
		fs.writeSync(fd,"\t\tTrackNode ( "+node.id+"\r\n",
		  null,"utf16le");
		if (node.pins.length == 1) {
			writeEndNode(node);
			writeUiD(node);
		} else if (node.pins.length == 2) {
			writeVectorNode(node);
		} else {
			writeJunctionNode(node);
			writeUiD(node);
		}
		writePins(node);
		fs.writeSync(fd,"\t\t)\r\n",null,"utf16le");
	}
	fs.writeSync(fd,"\t)\r\n",null,"utf16le");
	if (tdb.itemTable) {
		let table= tdb.itemTable;
		fs.writeSync(fd,"\tTrItemTable ( "+table[0].value+
		  "\r\n",null,"utf16le");
		for (let i=1; i<table.length; i+=2) {
			printItem(fd,table[i].value,table[i+1].children,2);
		}
		fs.writeSync(fd,"\t)\r\n",null,"utf16le");
	}
	fs.writeSync(fd,")",null,"utf16le");
	fs.closeSync(fd);
}

//	Adds tiles to route for all track control points and then adds
//	adjacent tiles.
//	Does not update TD files.
let addTiles= function()
{
	for (let i=0; i<tracks.length; i++) {
		let controlPoints= tracks[i].controlPoints;
		for (let j=0; j<controlPoints.length; j++) {
			let cp= controlPoints[j];
			let tx= centerTX + Math.round(cp.position.x/2048);
			let tz= centerTZ + Math.round(cp.position.y/2048);
			let tile= findTile(tx,tz);
			if (!tile) {
				tile= { x: tx, z: tz, newTrack: true };
				tiles.push(tile);
//				console.log("add track "+tx+" "+tz);
				createTFile(tile);
			}
		}
	}
	for (let i=0; i<tiles.length; i++) {
		let newTile= tiles[i];
		if (!newTile.newTrack)
			continue;
		for (let j=-1; j<=1; j++) {
			for (let k=-1; k<=1; k++) {
				if (j!=0 || k!=0) {
					let tx= newTile.x+j;
					let tz= newTile.z+k;
					let tile= findTile(tx,tz);
					if (!tile) {
						tile= { x: tx, z: tz,
						  newEdge: true };
						tiles.push(tile);
//						console.log("add edge "+
//						  tx+" "+tz);
						createTFile(tile);
					}
				}
			}
		}
	}
	makeQuadTree();
}

//	creates a .t file for the specified tile using imageFile as the
//	name of the terrain texture.
let createTFile= function(tile,imageFile)
{
	let hexdigit= [
		'0','1','4','5',
		'3','2','7','6',
		'c','d','8','9',
		'f','e','b','a'
	];
	let x= tile.x+16384;
	let z= 16384-tile.z-1;
	x<<= 1;
	z<<= 1;
	let filename= "-";
	for (let i=1; i<9; i++) {
		let s= 16-2*i;
		let xm= (x&(3<<s))>>s;
		let zm= (z&(3<<s))>>s;
		let j= xm+(zm<<2);
		filename+= hexdigit[j];
	}
	tile.filename= filename;
	test= tFileToXZ(tile.filename);
	if (tile.x!=test.x || tile.z!=test.z)
		console.log("mismatch "+tile.x+" "+tile.z+" "+tile.filename+" "+
		  test.x+" "+test.z+" "+test.filename);
	let water= getWaterInfo(tile);
	let path= routeDir+fspath.sep+'TILES'+fspath.sep+tile.filename+".t";
	const fd= fs.openSync(path,"w");
	if (!fd)
		throw 'cannot create file '+path;
	fs.writeSync(fd,"SIMISA@@@@@@@@@@JINX0t6b______\r\n");
	const buf= Buffer.alloc(4);
	// writes a 4 byte int to the file
	let writeInt= function(n)
	{
		buf.writeInt32LE(n,0);
		return fs.writeSync(fd,buf,0,4);
	}
	// writes a 2 byte int to the file
	let writeShort= function(n)
	{
		buf.writeInt16LE(n,0);
		return fs.writeSync(fd,buf,0,2);
	}
	// writes a 4 byte float to the file
	let writeFloat= function(x)
	{
		buf.writeFloatLE(x,0);
		return fs.writeSync(fd,buf,0,4);
	}
	// writes a 1 byte int to the file
	let writeByte= function(b)
	{
		buf.writeUInt8(b,0);
		return fs.writeSync(fd,buf,0,1);
	}
	// writes 4 byte code and length values to the file
	// and a zero length label
	let writeCodeLen= function(code,len)
	{
		let n= writeInt(code);
		n+= writeInt(len);
		n+= writeByte(0);
		return n;
	}
	// writes 4 byte code and integer values to the file
	// along with length and a zero length label
	let writeCodeInt= function(code,n)
	{
		let m= writeInt(code);
		m+= writeInt(5);
		m+= writeByte(0);
		m+= writeInt(n);
		return m;
	}
	// writes 4 byte code and float values to the file
	// along with length and a zero length label
	let writeCodeFloat= function(code,x)
	{
		let n= writeInt(code);
		n+= writeInt(5);
		n+= writeByte(0);
		n+= writeFloat(x);
		return n;
	}
	// writes a unicode string with length to the file
	let writeUString= function(s)
	{
		let n= writeShort(s.length);
		n+= fs.writeSync(fd,s,null,"utf16le");
		return n;
	}
	// writes a 4 byte code and unicode string with length to the file
	let writeCodeUString= function(code,s)
	{
		let n= writeCodeLen(code,1+2+2*s.length);
		n+= writeShort(s.length);
		n+= fs.writeSync(fd,s,null,"utf16le");
		return n;
	}
	let perTile= false;
	if (!imageFile)
		imageFile= "terrain.ace";
	else
		perTile= true;
	let delta= 2*(imageFile.length-11);
	let n= writeCodeLen(136,18316+delta);
	n+= writeCodeFloat(137,1);//terrain_errthreshold_scale
	n+= writeCodeLen(251,17);//terrain_water_height_offset
	if (water) {
		n+= writeFloat(water.sw);
		n+= writeFloat(water.se);
		n+= writeFloat(water.ne);
		n+= writeFloat(water.nw);
	} else {
		n+= writeFloat(-1);
		n+= writeFloat(-1);
		n+= writeFloat(-1);
		n+= writeFloat(-1);
	}
	n+= writeCodeInt(138,0);//terrain_alwaysselect_maxdist
	n+= writeCodeLen(139,189);//terrain_samples
	n+= writeCodeInt(140,256);//terrain_nsamples
	n+= writeCodeFloat(141,0);//terrain_sample_rotation
	if (tile.floor)
		n+= writeCodeFloat(142,tile.floor);//terrain_sample_floor
	else
		n+= writeCodeFloat(142,-63);//terrain_sample_floor
	if (tile.scale)
		n+= writeCodeFloat(143,tile.scale);//terrain_sample_scale
	else
		n+= writeCodeFloat(143,.002);//terrain_sample_scale
	let centerY= tile.floor ? tile.floor+32768*tile.scale : 1;
	let rangeY= tile.floor ? 65536*tile.scale : 0;
	n+= writeCodeFloat(144,8);//terrain_sample_size
	n+= writeCodeUString(146,filename+"_y.raw");
	n+= writeCodeUString(147,filename+"_e.raw");
	n+= writeCodeUString(148,filename+"_n.raw");
	n+= writeCodeLen(151,329+delta);//terrain_shaders
	n+= writeInt(2);
	n+= writeCodeLen(152,189+delta);//terrain_shader
	n+= writeUString("DetailTerrain");
	n+= writeCodeLen(153,89+delta);//terrain_texslots
	n+= writeInt(2);
	n+= writeCodeLen(154,33+delta);//terrain_texslot
	n+= writeUString(imageFile);
	n+= writeInt(1);
	n+= writeInt(0);
	n+= writeCodeLen(154,35);//terrain_texslot
	n+= writeUString("microtex.ace");
	n+= writeInt(1);
	n+= writeInt(1);
	n+= writeCodeLen(155,55);//terrain_uvcalcs
	n+= writeInt(2);
	n+= writeCodeLen(156,17);//terrain_uvcalc
	n+= writeInt(1);
	n+= writeInt(0);
	n+= writeInt(0);
	n+= writeFloat(0);
	n+= writeCodeLen(156,17);//terrain_uvcalc
	n+= writeInt(2);
	n+= writeInt(0);
	n+= writeInt(1);
	n+= writeFloat(32);
	n+= writeCodeLen(152,119);//terrain_shader
	n+= writeUString("AlphaTerrain");
	n+= writeCodeLen(153,46);//terrain_texslots
	n+= writeInt(1);
	n+= writeCodeLen(154,33);//terrain_texslot
	n+= writeUString("terrain.ace");
	n+= writeInt(1);
	n+= writeInt(0);
	n+= writeCodeLen(155,30);//terrain_uvcalcs
	n+= writeInt(1);
	n+= writeCodeLen(156,17);//terrain_uvcalc
	n+= writeInt(1);
	n+= writeInt(0);
	n+= writeInt(0);
	n+= writeFloat(0);
	n+= writeCodeLen(157,17722);//terrain_patches
	n+= writeCodeLen(158,17713);//terrain_patchsets
	n+= writeInt(1);
	n+= writeCodeLen(159,17700);//terrain_patchset
	n+= writeCodeFloat(160,0);//terrain_patchset_distance
	n+= writeCodeInt(161,16);//terrain_patchset_npatches
	n+= writeCodeLen(163,17665);//terrain_patchset
	let flags= [];
	for (let i=0; i<256; i++)
		flags.push(0);
	if (water) {
		for (let i=0; i<256; i++)
			flags[i]= water.patchFlags[i];
	}
	if (tile.patchModels) {
		for (let i=0; i<tile.patchModels.length; i++) {
			let tpm= tile.patchModels[i];
			flags[tpm[0]*16+tpm[1]]|= 1;
		}
	}
	for (let i=0; i<16; i++) {
		for (let j=0; j<16; j++) {
			n+= writeCodeLen(164,61);//terrain_patchset
			n+= writeInt(flags[i*16+j]);
			n+= writeFloat(64+128*j); //center X
			n+= writeFloat(centerY); // altitude? center Y
			n+= writeFloat(-64-128*i);//center Z
			n+= writeFloat(99.481255);//factor Y
			n+= writeFloat(rangeY);// altitude size? range Y
			n+= writeFloat(64);// radius
			n+= writeInt(0);
			if (perTile) {
				n+= writeFloat(j/16);
				n+= writeFloat(1-i/16);
				n+= writeFloat(.0625/16);
				n+= writeFloat(0);
				n+= writeFloat(0);
				n+= writeFloat(-.0625/16);
			} else {
				n+= writeFloat(.0001);
				n+= writeFloat(.0001);
				n+= writeFloat(.0625);
				n+= writeFloat(0);
				n+= writeFloat(0);
				n+= writeFloat(.0625);
			}
			n+= writeFloat(1);
		}
	}
	fs.closeSync(fd);
}

//	creates a new route tsection.dat file that contains all of the
//	dynamic track entries in the specified tsection object.
let writeTSection= function(tsection)
{
	let nDyn= 0;
	for (let i=0; i<tsection.sections.length; i++) {
		let s= tsection.sections[i];
		if (s && s.dynTrack && s.length)
			nDyn+= 2;
		else if (s && s.dynTrack)
			nDyn++;
	}
	let nPaths= 0;
	for (let i=0; i<tsection.trackPaths.length; i++) {
		let p= tsection.trackPaths[i];
		if (p)
			nPaths++;
	}
	let path= routeDir+fspath.sep+"tsection.dat";
	const fd= fs.openSync(path,"w");
	const bom= Buffer.alloc(2);
	bom.writeUInt16LE(0xfeff,0);
	fs.writeSync(fd,bom,0,2);
	fs.writeSync(fd,"SIMISA@@@@@@@@@@JINX0T0t______\r\n",null,"utf16le");
	fs.writeSync(fd,"\r\n",null,"utf16le");
	fs.writeSync(fd,"TrackSections ( "+nDyn+"\r\n",null,"utf16le");
	for (let i=0; i<tsection.sections.length; i++) {
		let s= tsection.sections[i];
		if (!s || !s.dynTrack)
			continue;
		fs.writeSync(fd,"\tTrackSection (\r\n",null,"utf16le");
		if (s && s.dynTrack && s.length)
			fs.writeSync(fd,"\t\tSectionCurve ( 0 ) "+i+" "+
			  s.length.toFixed(3)+" 0\r\n",null,"utf16le");
		else if (s && s.dynTrack)
			fs.writeSync(fd,"\t\tSectionCurve ( 1 ) "+i+" "+
			  (s.angle*Math.PI/180).toFixed(4)+" "+
			  s.radius.toFixed(3)+"\r\n",
			  null,"utf16le");
		fs.writeSync(fd,"\t)\r\n",null,"utf16le");
	}
	fs.writeSync(fd,")\r\n",null,"utf16le");
	fs.writeSync(fd,"SectionIdx ( "+nPaths+"\r\n",null,"utf16le");
	for (let i=0; i<tsection.trackPaths.length; i++) {
		let path= tsection.trackPaths[i];
		if (!path)
			continue;
		fs.writeSync(fd,"\tTrackPath ( "+i+" "+path.length,null,
		  "utf16le");
		for (let j=0; j<path.length; j++) 
			fs.writeSync(fd," "+path[j],null,"utf16le");
		fs.writeSync(fd," )\r\n",null,"utf16le");
	}
	fs.writeSync(fd,")",null,"utf16le");
	fs.closeSync(fd);
}

// formats tile id coordinate for use in .w or .td file name
let tileCoordToStr= function(n,len)
{
	if (!len)
		len= 6;
	let s= n<0 ? "-" : "+";
	let ns= Math.abs(n).toFixed(0);
	for (let i=len; i>ns.length; i--)
		s+= "0";
	return s+ns;
}

//	returns a string containing the path for a tile's .w file.
let getWorldFilePath= function(tile)
{
	let path= routeDir+fspath.sep+"WORLD"+fspath.sep+
	  "w"+tileCoordToStr(tile.x,6)+tileCoordToStr(tile.z,6)+".w";
//	console.log("path "+path);
	return path;
}

//	reads a tile's existing .w file to determine the next available Uid
//	value.
//	Doesn't handle binary .w files.
let setNextUid= function(tile)
{
	let path= getWorldFilePath(tile);
//	console.log("find uid "+path);
	let wFile= readFile(path);
	if (!wFile)
		return;
	if (wFile.children[0].value != "Tr_Worldfile")
		throw "bad .w file "+path;
	wFile= wFile.children[1];
	for (let i=0; i<wFile.children.length; i++) {
		let c= wFile.children[i];
		for (let j=0; j<c.children.length; j++) {
			let cj= c.children[j];
			if (cj.value == "UiD") {
				cj= c.children[j+1];
				let uid= parseInt(cj.children[0].value);
				if (tile.nextUid <= uid)
					tile.nextUid= uid+1;
			}
		}
	}
//	console.log("nextuid "+tile.filename+" "+tile.nextUid);
}

//	creates a new .w file for the specified tile containing Dyntrack
//	and TrackObj objects.
let writeWorldFile= function(tile)
{
	let path= getWorldFilePath(tile);
	let wFile= readFile(path);
	if (wFile && wFile.children[0].value != "Tr_Worldfile")
		throw "bad .w file "+path;
	if (wFile)
		wFile= wFile.children[1];
	const fd= fs.openSync(path,"w");
	const bom= Buffer.alloc(2);
	bom.writeUInt16LE(0xfeff,0);
	fs.writeSync(fd,bom,0,2);
	fs.writeSync(fd,"SIMISA@@@@@@@@@@JINX0w0t______\r\n",null,"utf16le");
	fs.writeSync(fd,"\r\n",null,"utf16le");
	fs.writeSync(fd,"Tr_Worldfile (\r\n",null,"utf16le");
	let printWItems= function(c,c1,indent) {
		for (let i=0; i<indent; i++)
			fs.writeSync(fd,"\t",null,"utf16le");
		fs.writeSync(fd,c.value,null,"utf16le");
		fs.writeSync(fd," (",null,"utf16le");
		let n= 0;
		for (let i=0; i<c1.children.length; i++) {
			let c2= c1.children[i];
			if (c2.children.length>0)
				n++;
		}
		if (n > 0) {
			fs.writeSync(fd,"\r\n",null,"utf16le");
			for (let i=0; i<c1.children.length; i++) {
				let c2= c1.children[i];
				if (i<c1.children.length-1 &&
				  c1.children[i+1].children.length>0) {
					printWItems(c2,c1.children[i+1],
					  indent+1);
					i++;
				} else {
					fs.writeSync(fd," ",null,"utf16le");
					fs.writeSync(fd,c2.value,null,
					  "utf16le");
				}
			}
			for (let i=0; i<indent; i++)
				fs.writeSync(fd,"\t",null,"utf16le");
		} else {
			for (let i=0; i<c1.children.length; i++) {
				let c2= c1.children[i];
				fs.writeSync(fd," ",null,"utf16le");
				fs.writeSync(fd,c2.value,null,"utf16le");
			}
			fs.writeSync(fd," ",null,"utf16le");
		}
		fs.writeSync(fd,")\r\n",null,"utf16le");
	}
	for (let i=0; wFile && addToTrackDB && i<wFile.children.length; i+=2) {
		let c= wFile.children[i];
		if (!addToTrackDB && (c.children.length>0 ||
		  c.value=="Dyntrack" || c.value=="Trackobj"))
			continue;
//		console.log("wfc "+i+" "+c.value+" "+c.children.length);
		printItem(fd,c.value,wFile.children[i+1].children,1);
	}
	let saveForest= function(model,type2,treeData) {
		let forest= model.forest;
		let wfuid= model.wfuid + (type2 ? 1 : 0);
		let ay= -model.ay + (type2 ? Math.PI/2 : 0);
		let areaw= type2 ? forest.areah : forest.areaw;
		let areah= type2 ? forest.areaw : forest.areah;
		fs.writeSync(fd,"\tForest (\r\n",null,"utf16le");
		fs.writeSync(fd,"\t\tUiD ( "+wfuid+" )\r\n",null,"utf16le");
		fs.writeSync(fd,"\t\tTreeTexture ( "+treeData.texture+" )\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"\t\tStaticFlags ( 00200100 )\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"\t\tPosition ( "+
		  model.x.toFixed(3)+" "+model.y.toFixed(3)+" "+
		  model.z.toFixed(3)+" )\r\n",
		  null,"utf16le");
		let q= new THREE.Quaternion();
		let e= new THREE.Euler(-model.ax,ay,model.az);
		q.setFromEuler(e);
		fs.writeSync(fd,"\t\tQDirection ( "+
		  q.x.toFixed(5)+" "+q.y.toFixed(5)+" "+
		  q.z.toFixed(5)+" "+q.w.toFixed(5)+" )\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"\t\tScaleRange ( "+
		  treeData.scale0.toFixed(3)+" "+
		  treeData.scale1.toFixed(3)+" )\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"\t\tArea ( "+
		  areah.toFixed(3)+" "+
		  areaw.toFixed(3)+" )\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"\t\tTreeSize ( "+
		  treeData.sizew.toFixed(3)+" "+
		  treeData.sizeh.toFixed(3)+" )\r\n",
		  null,"utf16le");
		let pop= treeData.density*areaw*areah/
		  (treeData.sizew*treeData.sizew*Math.PI/4);
		fs.writeSync(fd,"\t\tPopulation ( "+
		  pop.toFixed(0)+" )\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"\t\tVDbId ( 4294967294 )\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"\t)\r\n",null,"utf16le");
	}
	for (let i=0; i<tile.models.length; i++) {
		let model= tile.models[i];
		if (model.position) {
			let curve= model.curve;
			fs.writeSync(fd,"\tDyntrack (\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\tUiD ( "+model.uid+" )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tTrackSections (\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\t\tTrackSection (\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\t\t\tSectionCurve ( 0 ) ",
			  null,"utf16le");
			let j= 0;
			if (curve.len1 > .01) {
				fs.writeSync(fd,curve.path[j].toFixed(0)+" "+
				  curve.len1.toFixed(3)+" 0\r\n",
				  null,"utf16le");
				j++;
			} else {
				fs.writeSync(fd,"4294967295 0 0\r\n",
				  null,"utf16le");
			}
			fs.writeSync(fd,"\t\t\t)\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\t\tTrackSection (\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\t\t\tSectionCurve ( 1 ) ",
			  null,"utf16le");
			if (curve.radius > 10) {
				fs.writeSync(fd,curve.path[j].toFixed(0)+" "+
				  (-curve.angle).toFixed(4)+" "+
				  curve.radius.toFixed(3)+"\r\n",
				  null,"utf16le");
				j++;
			} else {
				fs.writeSync(fd,"4294967295 0 0\r\n",
				  null,"utf16le");
			}
			fs.writeSync(fd,"\t\t\t)\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\t\tTrackSection (\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\t\t\tSectionCurve ( 0 ) ",
			  null,"utf16le");
			if (curve.len2 > .01) {
				fs.writeSync(fd,curve.path[j].toFixed(0)+" "+
				  curve.len2.toFixed(3)+" 0\r\n",
				  null,"utf16le");
				j++;
			} else {
				fs.writeSync(fd,"4294967295 0 0\r\n",
				  null,"utf16le");
			}
			fs.writeSync(fd,"\t\t\t)\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\t\tTrackSection (\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\t\t\tSectionCurve ( 1 ) "+
			  "4294967295 0 0\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\t\t)\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\t\tTrackSection (\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\t\t\tSectionCurve ( 0 ) "+
			  "4294967295 0 0\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\t\t)\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\t)\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\tSectionIdx ( "+model.shape+
			  " )\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\tElevation ( 0 )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tCollideFlags ( 583 )\r\n",
			  null,"utf16le");
			if (model.bridge)
				console.log("bridge "+model.shape+" "+
				  curve.len1+" "+curve.angle+" "+
				  curve.radius+" "+curve.len2);
			if (model.bridge)
				fs.writeSync(fd,
				  "\t\tStaticFlags ( 10100000 )\r\n",
				  null,"utf16le");
			else
				fs.writeSync(fd,
				  "\t\tStaticFlags ( 00100000 )\r\n",
				  null,"utf16le");
			fs.writeSync(fd,"\t\tPosition ( "+
			  model.section.x.toFixed(3)+" "+
			  model.section.y.toFixed(3)+" "+
			  model.section.z.toFixed(3)+" )\r\n",
			  null,"utf16le");
			let q= new THREE.Quaternion();
//			let e= new THREE.Euler(0,
//			  Math.PI-model.section.ay,0,
//			  "YXZ");
//			let e= new THREE.Euler(model.section.ax,
//			  Math.PI-model.section.ay,model.section.az);
			let e= new THREE.Euler(-model.section.ax,
			  -model.section.ay,model.section.az);
			q.setFromEuler(e);
			fs.writeSync(fd,"\t\tQDirection ( "+
			  q.x.toFixed(5)+" "+q.y.toFixed(5)+" "+
			  q.z.toFixed(5)+" "+q.w.toFixed(5)+" )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tVDbId ( 4294967294 )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t)\r\n",null,"utf16le");
		} else if (model.filename) {
			fs.writeSync(fd,"\tStatic (\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\tUiD ( "+model.wfuid+" )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tFileName ( "+model.filename+
			  " )\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\tStaticFlags ( 00000100 )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tPosition ( "+
			  model.x.toFixed(3)+" "+model.y.toFixed(3)+" "+
			  model.z.toFixed(3)+" )\r\n",
			  null,"utf16le");
			let q= new THREE.Quaternion();
			let e= new THREE.Euler(-model.ax,-model.ay,
			  model.az);
			q.setFromEuler(e);
			fs.writeSync(fd,"\t\tQDirection ( "+
			  q.x.toFixed(5)+" "+q.y.toFixed(5)+" "+
			  q.z.toFixed(5)+" "+q.w.toFixed(5)+" )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tVDbId ( 4294967294 )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t)\r\n",null,"utf16le");
		} else if (model.forest) {
			saveForest(model,false,model.forest);
			if (model.forest.type2)
				saveForest(model,true,model.forest.type2);
		} else {
			fs.writeSync(fd,"\tTrackObj (\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\tUiD ( "+model.wfuid+" )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tSectionIdx ( "+model.shape+
			  " )\r\n",null,"utf16le");
			fs.writeSync(fd,"\t\tElevation ( 0 )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tJNodePosn ( "+
			  model.wftx+" "+model.wftz+" "+
			  model.x.toFixed(3)+" "+model.y.toFixed(3)+" "+
			  model.z.toFixed(3)+" )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tCollideFlags ( 583 )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tFileName ( "+
			  trackDB.tSection.shapes[model.shape].filename+
			  " )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tStaticFlags ( 00200100 )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tPosition ( "+
			  model.x.toFixed(3)+" "+model.y.toFixed(3)+" "+
			  model.z.toFixed(3)+" )\r\n",
			  null,"utf16le");
//			console.log("sw angle "+model.ax+" "+model.ay+
//			  " "+model.az+" "+(Math.PI-model.ay));
//			console.log("sw angle "+model.ax+" "+model.ay+
//			  " "+model.az+" "+(-model.ay));
			let q= new THREE.Quaternion();
//			let e= new THREE.Euler(0,Math.PI-model.ay,
//			  0,"YXZ");
//			let e= new THREE.Euler(model.ax,Math.PI-model.ay,
//			  model.az);
			let e= new THREE.Euler(-model.ax,-model.ay,
			  model.az);
			q.setFromEuler(e);
//			console.log("sw q "+q.x+" "+q.y+" "+q.z+" "+q.w);
			fs.writeSync(fd,"\t\tQDirection ( "+
			  q.x.toFixed(5)+" "+q.y.toFixed(5)+" "+
			  q.z.toFixed(5)+" "+q.w.toFixed(5)+" )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t\tVDbId ( 4294967294 )\r\n",
			  null,"utf16le");
			fs.writeSync(fd,"\t)\r\n",null,"utf16le");
		}
	}
	for (let i=0; tile.patchModels && i<tile.patchModels.length; i++) {
		let tpm= tile.patchModels[i];
		let filename= "t"+tile.filename+"_"+tpm[0]+"_"+tpm[1]+".s";
		let uid= tile.nextUid++;
//		console.log(filename+" "+uid);
		fs.writeSync(fd,"\tStatic (\r\n",null,"utf16le");
		fs.writeSync(fd,"\t\tUiD ( "+uid+" )\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"\t\tFileName ( "+filename+
		  " )\r\n",null,"utf16le");
		fs.writeSync(fd,"\t\tStaticFlags ( 00000100 )\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"\t\tPosition ( 0 0 0 )\r\n",
		  null,"utf16le");
		let q= new THREE.Quaternion();
		let e= new THREE.Euler(0,0,0);
		q.setFromEuler(e);
		fs.writeSync(fd,"\t\tQDirection ( "+
		  q.x.toFixed(5)+" "+q.y.toFixed(5)+" "+
		  q.z.toFixed(5)+" "+q.w.toFixed(5)+" )\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"\t\tVDbId ( 4294967294 )\r\n",
		  null,"utf16le");
		fs.writeSync(fd,"\t)\r\n",null,"utf16le");
	}
	fs.writeSync(fd,")",null,"utf16le");
	fs.closeSync(fd);
}

//	recursively prints a .w or .tdb file item.
let printItem= function(fd,label,children,indent)
{
	for (let i=0; i<indent; i++)
		fs.writeSync(fd,"\t",null,"utf16le");
	fs.writeSync(fd,label,null,"utf16le");
	fs.writeSync(fd," (",null,"utf16le");
	let n= 0;
	for (let i=0; i<children.length; i++) {
		let child= children[i];
		if (child.children.length>0)
			n++;
	}
	if (n > 0) {
		fs.writeSync(fd,"\r\n",null,"utf16le");
		for (let i=0; i<children.length; i++) {
			let child= children[i];
			if (i<children.length-1 &&
			  children[i+1].children.length>0) {
				printItem(fd,child.value,children[i+1].children,
				  indent+1);
				i++;
			} else {
				fs.writeSync(fd," ",null,"utf16le");
				fs.writeSync(fd,child.value,null,
				  "utf16le");
			}
		}
		for (let i=0; i<indent; i++)
			fs.writeSync(fd,"\t",null,"utf16le");
	} else {
		for (let i=0; i<children.length; i++) {
			let child= children[i];
			fs.writeSync(fd," ",null,"utf16le");
			fs.writeSync(fd,child.value,null,"utf16le");
		}
		fs.writeSync(fd," ",null,"utf16le");
	}
	fs.writeSync(fd,")\r\n",null,"utf16le");
}

//	test function for verifying that THREE.Quaternion matches QDirection.
let testQDir= function()
{
	let q= new THREE.Quaternion();
	let e= new THREE.Euler(0,0,0);
	q.setFromEuler(e);
	console.log("qdir0 "+q.w+" "+q.x+" "+q.y+" "+q.z);
	let e90= new THREE.Euler(0,Math.PI/2,0);
	q.setFromEuler(e90);
	console.log("qdir90 "+q.w+" "+q.x+" "+q.y+" "+q.z);
	let en90= new THREE.Euler(0,-Math.PI/2,0);
	q.setFromEuler(en90);
	console.log("qdir-90 "+q.w+" "+q.x+" "+q.y+" "+q.z);
	let e180= new THREE.Euler(0,Math.PI,0);
	q.setFromEuler(e180);
	console.log("qdir180 "+q.w+" "+q.x+" "+q.y+" "+q.z);
	let en180= new THREE.Euler(0,-Math.PI,0);
	q.setFromEuler(en180);
	console.log("qdir-180 "+q.w+" "+q.x+" "+q.y+" "+q.z);
	q.x= -.00322149;
	q.y= -.175969;
	q.z= -.000575871;
	q.w= -.98439;
	let m= new THREE.Matrix4();
	m.makeRotationFromQuaternion(q);
	for (let i=0; i<16; i++)
		console.log("m "+i+" "+m.elements[i]);
	e.setFromQuaternion(q,"YXZ");
	console.log("q1 "+q.w+" "+q.x+" "+q.y+" "+q.z);
	console.log("q1 "+e.x+" "+e.y+" "+e.z);
	console.log("q1yxz "+(e.x*180/Math.PI)+" "+(e.y*180/Math.PI)+" "+
	  (e.z*180/Math.PI));
	e.setFromQuaternion(q,"ZYX");
	console.log("q1zyx "+(e.x*180/Math.PI)+" "+(e.y*180/Math.PI)+" "+
	  (e.z*180/Math.PI));
	e.setFromQuaternion(q,"XYZ");
	console.log("q1xyz "+(e.x*180/Math.PI)+" "+(e.y*180/Math.PI)+" "+
	  (e.z*180/Math.PI));
	q.x= .00322149;
	q.y= .175969;
	q.z= .000575871;
	q.w= .98439;
	console.log("q1 "+q.w+" "+q.x+" "+q.y+" "+q.z);
	m.makeRotationFromQuaternion(q);
	for (let i=0; i<16; i++)
		console.log("m "+i+" "+m.elements[i]);
	q.setFromEuler(e);
	console.log("q1fe "+q.w+" "+q.x+" "+q.y+" "+q.z);
	e.x= .375*Math.PI/180;
	e.y= 20.2702*Math.PI/180;
	e.z= 0;
	q.setFromEuler(e);
	console.log("q1e "+q.w+" "+q.x+" "+q.y+" "+q.z);
	e.y= -20.2702*Math.PI/180;
	q.setFromEuler(e);
	console.log("q1e- "+q.w+" "+q.x+" "+q.y+" "+q.z);
	e.x= .375*Math.PI/180;
	e.y= 20.2702*Math.PI/180;
	e.z= Math.PI;
	q.setFromEuler(e);
	console.log("q1ef "+q.w+" "+q.x+" "+q.y+" "+q.z);
	q.x= -.00047883;
	q.y= -.969808;
	q.z= -.00190423;
	q.w= -.243864;
	e.setFromQuaternion(q,"YXZ");
	console.log("q2 "+q.w+" "+q.x+" "+q.y+" "+q.z);
	console.log("q2 "+e.x+" "+e.y+" "+e.z);
	console.log("q2yxz "+(e.x*180/Math.PI)+" "+(e.y*180/Math.PI)+" "+
	  (e.z*180/Math.PI));
	e.setFromQuaternion(q,"ZYX");
	console.log("q2zyx "+(e.x*180/Math.PI)+" "+(e.y*180/Math.PI)+" "+
	  (e.z*180/Math.PI));
	e.setFromQuaternion(q,"XYZ");
	console.log("q2xyz "+(e.x*180/Math.PI)+" "+(e.y*180/Math.PI)+" "+
	  (e.z*180/Math.PI));
	q.setFromEuler(e);
	console.log("q2fe "+q.w+" "+q.x+" "+q.y+" "+q.z);
	e.x= .225*Math.PI/180;
	e.y= 151.7705*Math.PI/180;
	e.z= 0;
	q.setFromEuler(e);
	console.log("q2e "+q.w+" "+q.x+" "+q.y+" "+q.z);
	e.y= -151.7705*Math.PI/180;
	q.setFromEuler(e);
	console.log("q2e- "+q.w+" "+q.x+" "+q.y+" "+q.z);
	e.x= .225*Math.PI/180;
	e.y= 151.7705*Math.PI/180;
	e.z= Math.PI;
	q.setFromEuler(e);
	console.log("q2ef "+q.w+" "+q.x+" "+q.y+" "+q.z);
}
	
//	Implements File menu Save To Route function.
//	Creates new TDB, route tsection.dat and .w files for all tiles.
//	Also saves any modified terrain elevation data.
let saveToRoute= function()
{
	calcTrackPointElevations();
	overrideSwitchShapes();
	let tsection= trackDB.tSection;
	let nextSection= 40000;
	let nextPath= 40000;
	if (addToTrackDB) {
		for (let i=0; i<tsection.sections.length; i++) {
			let s= tsection.sections[i];
			if (s && nextSection<=i)
				nextSection= i+1;
		}
		for (let i=0; i<tsection.trackPaths.length; i++) {
			let p= tsection.trackPaths[i];
			if (p && nextPath<=i)
				nextPath= i+1;
		}
	}
	for (let i=nextSection; i<tsection.sections.length; i++)
		tsection.sections[i]= null;
	if (nextSection%2 == 1)
		nextSection++;
	for (let i=nextPath; i<tsection.trackPaths.length; i++)
		tsection.trackPaths[i]= null;
	let equal= function(a,b) {
		let d= a-b;
		return -.001<d && d<.001 && a.toFixed(3)==b.toFixed(3);
	}
	let getSection= function(len,radius,angle) {
		for (let i=0; i<nextSection; i++) {
			let s= tsection.sections[i];
			if (s && s.dynTrack && len && equal(s.length,len))
				return i;
			if (s && s.dynTrack && radius &&
			  equal(s.radius,radius) && equal(s.dAngle,angle))
				return i;
		}
		if (len) {
			tsection.sections[nextSection]=
			  { length: len, dynTrack: true };
			nextSection++;
			tsection.sections[nextSection]= null;
			nextSection++;
			return nextSection-2;
		} else {
			let a= Math.abs(angle)*180/Math.PI;
			tsection.sections[nextSection]= { radius: radius,
			  angle: -a, dAngle: -Math.abs(angle), dynTrack: true };
			tsection.sections[nextSection+1]= { radius: radius,
			  angle: a, dAngle: Math.abs(angle), dynTrack: true };
			nextSection+= 2;
			if (angle < 0)
				return nextSection-2;
			else
				return nextSection-1;
		}
	}
//	console.log("next "+nextSection+" "+nextPath);
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track.type == "water" || track.type == "road" ||
		  track.type == "dirtroad" || track.type == "dirtroad1" ||
		  track.type=="contour")
			continue;
		let dynTrackPoints= track.dynTrackPoints;
		for (let j=0; j<dynTrackPoints.length-1; j++) {
			let dp= dynTrackPoints[j];
			let curve= dp.curve;
			let path= [];
			if (curve.len1 > .01) {
				path.push(getSection(curve.len1));
			}
			if (curve.radius > 10) {
				path.push(getSection(0,curve.radius,
				  -curve.angle));
			}
			if (curve.len2 > .01) {
				path.push(getSection(curve.len2));
			}
			if (path.length > 0) {
				curve.path= path;
				curve.shapeID= nextPath;
				dp.shape= nextPath;
				tsection.trackPaths[nextPath]= path;
				nextPath++;
				if (dp.bridge)
					saveBridgeTrackShape(dp);
			} else {
				curve.path= null;
				curve.shapeID= 0;
				dp.shape= 0;
			}
		}
	}
//	console.log("next "+nextSection+" "+nextPath);
	// add empty pins array to tdb node
	let addPins= function(node,n) {
		node.pins= [];
		for (let i=0; i<n; i++)
			node.pins.push({ node: 0, end: 0 });
	}
	// set tdb node Uid information
	let setUid= function(node,point,grade) {
		node.wftx= centerTX + Math.round(point.position.x/2048);
		node.wftz= centerTZ + Math.round(point.position.y/2048);
		node.wfuid= 0;
		node.unk= 0;
		node.tx= node.wftx;
		node.tz= node.wftz;
		node.x= point.position.x - 2048*(node.wftx-centerTX);
		node.y= point.position.z;
		node.z= point.position.y - 2048*(node.wftz-centerTZ);
		node.ax= -grade;
//		node.ay= -Math.PI/2-
//		  Math.atan2(point.direction.y,point.direction.x);
		node.angle= Math.atan2(point.direction.y,point.direction.x);
		if (point.forcedDirection && point.forcedDirection==1)
			node.angle+= Math.PI;
		node.ay= Math.PI/2-node.angle;
		node.az= 0;
	}
	// set tdb node section information for vector section
	let addSection= function(node,x,y,z,angle,vangle,shapeID,sectionID) {
		let tx= centerTX + Math.round(x/2048);
		let tz= centerTZ + Math.round(y/2048);
		let section= {};
		section.sectionID= sectionID;
		section.shapeID= shapeID;
		section.wftx= tx;
		section.wftz= tz;
		section.wfuid= 0;
		section.flag1= 1;
//		flag1==1 for first section and ==2 for flipped section?
		section.flag2= 0;
		section.flag3= "00";
		section.tx= tx;
		section.tz= tz;
		section.x= x - 2048*(tx-centerTX);
		section.y= z;
		section.z= y - 2048*(tz-centerTZ);
		section.ax= -vangle;
//		section.ay= -Math.PI/2-angle;
		section.ay= Math.PI/2-angle;
		section.az= 0;
		node.sections.push(section);
		return section;
	}
	// add vector sections to tdb node for dynamic track
	let addDynTrackSections= function(node,point) {
		let curve= point.curve;
		if (!curve.path)
			return;
		let x= point.position.x;
		let y= point.position.y;
		let z= point.elevation;
		let dir= point.direction;
		let angle= Math.atan2(dir.y,dir.x);
		let vangle= curve.elevation;
		let wftx= centerTX + Math.round(x/2048);
		let wftz= centerTZ + Math.round(y/2048);
		let tile= findTile(wftx,wftz);
		let uid= tile.nextUid;
		if (point.bridge && point.bridge!="turntable") {
			let filename=
			  ((point.bridge=="ptbd" || point.bridge=="tdbd") ?
			  "brdgtrackbd" : "brdgtracktd") +
			  curve.shapeID.toFixed(0) + ".s";
			addModel(filename,x,y,z,dir.x,dir.y,curve.elevation);
		} else {
			tile.nextUid++;
			tile.models.push(point);
		}
		point.uid= uid;
		let sec1= addSection(node,x,y,z,angle,vangle,
		  curve.shapeID,curve.path[0]);
		sec1.wfuid= uid;
		point.section= sec1;
		if (curve.path.length>1) {
			let csv= Math.cos(vangle);
			let snv= Math.sin(vangle);
			if (curve.len1 > .01) {
				x+= dir.x*curve.len1*csv;
				y+= dir.y*curve.len1*csv;
				z+= snv*curve.len1;
			} else {
				let cs= Math.cos(Math.abs(curve.angle));
				let sn= Math.sin(Math.abs(curve.angle));
				let dx= curve.radius*sn;
				let dy= curve.radius*(1-cs);
				if (curve.angle < 0)
					dy*= -1;
				x+= dir.x*dx*csv - dir.y*dy;
				y+= dir.y*dx*csv + dir.x*dy;
				z+= snv*dx;
				angle+= curve.angle;
			}
			let sec2= addSection(node,x,y,z,angle,vangle,
			  curve.shapeID,curve.path[1]);
			sec2.wftx= wftx;
			sec2.wftz= wftz;
			sec2.wfuid= uid;
		}
	}
	// add vector sections to tdb node for switch
	let addSwitchSections= function(node,sw,end,path) {
		let p= sw.points[end?path+1:0];
		let shape= trackDB.tSection.shapes[sw.trackNode.shape];
		let x= p.position.x;
		let y= p.position.y;
		let z= p.position.z;
		let csg= Math.sqrt(1-sw.grade*sw.grade);
		let dir= p.direction.clone();
		if (p.forcedDirection == (end?1:1))
			dir.negate();
		let angle= Math.atan2(dir.y,dir.x);
		let grade= end ? -sw.grade : sw.grade;
//		console.log("swend "+end+" "+sw.trackNode.ay+" "+angle+" "+
//		  sw.trackNode.ax+" "+grade+" "+dir.x+" "+dir.y);
		let sections= shape.paths[path].sections;
		let pathPoints= sw.pathPoints[path];
		for (let i=0; i<sections.length; i++) {
			let sectionID= sections[end?sections.length-i-1:i];
			let section= trackDB.tSection.sections[sectionID];
			if (section.angle && end) {
				if (section.angle < 0)
					sectionID++;
				else
					sectionID--;
				section= trackDB.tSection.sections[sectionID];
			}
			let sec= addSection(node,x,y,z,
			  angle,end?sw.trackNode.ax:-sw.trackNode.ax,
			  sw.trackNode.shape,sectionID);
			sec.wfuid= sw.trackNode.wfuid;
			if (section.length) {
				let len= section.length;
				x+= len*dir.x*csg;
				y+= len*dir.y;
				z+= len*grade;
			} else {
				let a= section.angle*Math.PI/180;
				let t= section.radius*Math.tan(Math.abs(a/2));
//				console.log("t "+t+" "+section.radius+" "+
//				  section.angle+" "+a);
				x+= t*dir.x*csg;
				y+= t*dir.y;
				let cos= Math.cos(a);
				let sin= Math.sin(-a);
				let dx= dir.x;
				let dy= dir.y;
				dir.x= cos*dx - sin*dy;
				dir.y= cos*dy + sin*dx;
				x+= t*dir.x*csg;
				y+= t*dir.y;
				z+= section.radius*Math.abs(a)*grade;
				angle-= a;
			}
			let pp= pathPoints[end?sections.length-i-1:i+1];
//			console.log("pp "+x+" "+y+" "+z+" "+angle);
//			console.log("pp "+pp.x+" "+pp.y+" "+pp.z+" "+pp.angle);
			x= pp.x;
			y= pp.y;
			z= pp.z;
			angle= end ? pp.angle+Math.PI : pp.angle;
		}
	}
	for (let i=0; i<tiles.length; i++) {
		tiles[i].nextUid= 1;
		tiles[i].models= [];
		if (addToTrackDB)
			setNextUid(tiles[i]);
	}
	let tdb= { nodes: [], serial: trackDB.serial+1 };
	let nextNodeID= 1;
	// add end node to tdb
	let addEndNode= function(point,vnode,end) {
		let node= { id: nextNodeID++ };
		tdb.nodes[node.id]= node;
		addPins(node,1);
		node.pins[0].node= vnode.id;
		node.pins[0].end= end;
		setUid(node,point,0);
		return node;
	}
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		let node= { id: nextNodeID++ };
		tdb.nodes[node.id]= node;
		node.unk2= 0;
		node.shape= sw.shapeID;
		node.manual= 1;
		setUid(node,sw.points[0],sw.grade);
		let tile= findTile(node.wftx,node.wftz);
		if (tile) {
			node.wfuid= tile.nextUid++;
			tile.models.push(node);
		}
		addPins(node,3);
		sw.trackNode= node;
	}
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track.type == "water" || track.type == "road" ||
		  track.type == "dirtroad" || track.type == "dirtroad1" ||
		  track.type=="contour")
			continue;
		let dynTrackPoints= track.dynTrackPoints;
		let controlPoints= track.controlPoints;
		if (controlPoints.length < 2)
			continue;
		let node= { id: nextNodeID++, sections: [] };
//		console.log("node "+node.id);
		tdb.nodes[node.id]= node;
		addPins(node,2);
		let cp= controlPoints[0];
		if (cp.sw) {
			let swnode= cp.sw.trackNode;
			let j= cp.sw.points.indexOf(cp);
			node.pins[0].node= swnode.id;
			node.pins[0].end= j>0 ? 0 : 1;
			swnode.pins[j].node= node.id;
			swnode.pins[j].end= 1;
			if (j > 0)
				addSwitchSections(node,cp.sw,0,j-1);
		} else {
			let enode= addEndNode(cp,node,1);
			node.pins[0].node= enode.id;
			node.pins[0].end= 1;
			if (cp.endNode)
				enode.otherEndNode= cp.endNode;
		}
		for (let j=0; j<dynTrackPoints.length-1; j++) {
			addDynTrackSections(node,dynTrackPoints[j]);
		}
		cp= controlPoints[controlPoints.length-1];
		if (cp.sw) {
			let swnode= cp.sw.trackNode;
			let j= cp.sw.points.indexOf(cp);
			node.pins[1].node= swnode.id;
			node.pins[1].end= j>0 ? 0 : 1;
			swnode.pins[j].node= node.id;
			swnode.pins[j].end= 0;
			if (j > 0)
				addSwitchSections(node,cp.sw,1,j-1);
		} else {
			let enode= addEndNode(cp,node,0);
			node.pins[1].node= enode.id;
			node.pins[1].end= 1;
			if (cp.endNode)
				enode.otherEndNode= cp.endNode;
		}
	}
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track.type == "water" || track.type=="contour")
			continue;
		let controlPoints= track.controlPoints;
		let j1= 0;
		let prevBridge= false;
		for (let j=0; j<controlPoints.length; j++) {
			let cp= controlPoints[j];
			if (cp.bridge) {
				if (!prevBridge && j>0)
					addBridgeEndModel(track,cp,true);
				prevBridge= cp.bridge!="turntable";
			} else if (prevBridge) {
				addBridgeEndModel(track,cp,false);
				prevBridge= false;
			}
			if (cp.bridge && j<controlPoints.length-1 && j>=j1 &&
			  (cp.bridge=="ptbd" || cp.bridge=="pttd" ||
			   cp.bridge=="ftbd" || cp.bridge=="fttd" ||
			   cp.bridge=="covb" || cp.bridge=="ibeam" ||
			   cp.bridge=="crbd")) {
				j1= j+1;
				let cp1= controlPoints[j1];
				while (cp.bridge===cp1.bridge) {
					j1++;
					cp1= controlPoints[j1];
				}
				addTrestle(track,cp,cp1)
			}
			if (cp.model || cp.forest) {
				let static= cp.forest ?
				  { forest: cp.forest } :
				  { filename: cp.model.filename };
				static.wftx= centerTX +
				  Math.round(cp.position.x/2048);
				static.wftz= centerTZ +
				  Math.round(cp.position.y/2048);
				static.x= cp.position.x -
				  2048*(static.wftx-centerTX);
				static.y= cp.position.z;
				if (cp.model)
					static.y+= cp.model.vOffset;
				static.z= cp.position.y -
				  2048*(static.wftz-centerTZ);
				let dir= cp.direction;
				let angle= Math.atan2(dir.y,dir.x);
				static.ax= -cp.cpGrade;
				static.ay= Math.PI/2-angle;
				static.az= 0;
				let tile= findTile(static.wftx,static.wftz);
				if (tile) {
					static.wfuid= tile.nextUid++;
					if (cp.forest && cp.forest.type2)
						tile.nextUid++;
					tile.models.push(static);
				}
			}
		}
	}
//	console.log("nextNodeID "+nextNodeID);
	for (let i=0; i<tiles.length; i++) {
		let tile= tiles[i];
		if (tile.models.length>0 || !addToTrackDB)
			writeWorldFile(tile);
		if (tile.terrain)
			writeTerrain(tile);
//		if (tile.patchModels)
//			writeTerrainFlags(tile);
	}
	if (addToTrackDB) {
		mergeTrackDB(trackDB,tdb);
		tdb= trackDB;
	}
	writeTSection(tsection);
	writeTrackDB(tdb);
	if (addToTrackDB) {
		tracks= [];
		switches= [];
		selected= null;
		readTrackDB(tdbPath);
		calcTrack();
		calcTrackDBUV();
		renderCanvas();
	}
	writePaths();
}

let mergeTrackDB= function(tdb1,tdb2)
{
	tdb1.serial= tdb2.serial;
	let nextNodeID= 1;
	let getNextNodeID= function() {
		while (nextNodeID<tdb1.nodes.length && tdb1.nodes[nextNodeID])
			nextNodeID++;
		return nextNodeID;
	}
	for (let i=1; i<tdb2.nodes.length; i++) {
		let node= tdb2.nodes[i];
		node.oldID= node.id;
		node.id= getNextNodeID();
		tdb1.nodes[node.id]= node;
		if (node.otherEndNode) {
			node.otherEndNode.otherEndNode= node;
		}
	}
	for (let i=1; i<tdb2.nodes.length; i++) {
		let node= tdb2.nodes[i];
		for (let j=0; j<node.pins.length; j++) {
			let onode= tdb2.nodes[node.pins[j].node];
			node.pins[j].node= onode.id;
		}
	}
	let reverse= function(vnode) {
//		console.log("reverse "+vnode.id+" "+
//		  vnode.pins[0].node+" "+vnode.pins[1].node+" "+
//		  vnode.pins[0].end+" "+vnode.pins[1].end);
		let sections= vnode.sections;
		for (let i=0; i<sections.length; i++) {
			let s= sections[i];
			let sec= tdb1.tSection.sections[s.sectionID];
			if (sec.radius && sec.angle<0)
				s.sectionID++;
			else if (sec.radius && sec.angle>0)
				s.sectionID--;
		}
		for (let i=0; i<sections.length-1; i++) {
			let s1= sections[i];
			let s2= sections[i+1];
			s1.wftx= s2.wftx;
			s1.wftz= s2.wftz;
			s1.wfuid= s2.wfuid;
			s1.tx= s2.tx;
			s1.tz= s2.tz;
			s1.x= s2.x;
			s1.y= s2.y;
			s1.z= s2.z;
			s1.ax= -s1.ax;
			s1.ay= s2.ay+Math.PI;
			s1.az= s2.az;
		}
		let s= sections[sections.length-1];
		let onode= tdb1.nodes[vnode.pins[1].node];
		s.wftx= onode.wftx;
		s.wftz= onode.wftz;
		s.wfuid= onode.wfuid;
		s.tx= onode.tx;
		s.tz= onode.tz;
		s.x= onode.x;
		s.y= onode.y;
		s.z= onode.z;
		s.ax= -s.ax;
		s.ay= s.ay+Math.PI;
		s.az= onode.az;
		let sec= tdb1.tSection.sections[s.sectionID];
		if (sec.angle)
			s.ay-= sec.angle*Math.PI/180;
//		console.log("onode "+onode.id+" "+onode.ay);
		vnode.sections.reverse();
		vnode.pins.reverse();
		for (let i=0; i<2; i++) {
			onode= tdb1.nodes[vnode.pins[i].node];
			for (let j=0; j<onode.pins.length; j++) {
				let pin= onode.pins[j];
				if (pin.node == vnode.id) {
					pin.end= 1-i;
				}
//				console.log("pin "+i+" "+j+" "+pin.node+" "+
//				  pin.end+" "+i);
			}
		}
	}
	for (let i=1; i<tdb1.nodes.length; i++) {
		let enode1= tdb1.nodes[i];
		if (!enode1.otherEndNode || enode1.delete)
			continue;
		let enode2= enode1.otherEndNode;
		let vnode1= tdb1.nodes[enode1.pins[0].node];
		let vnode2= tdb1.nodes[enode2.pins[0].node];
		let end1= enode1.pins[0].end;
		let end2= enode2.pins[0].end;
//		console.log("merge "+vnode1.id+" "+end1+" "+
//		  vnode2.id+" "+end2);
//		console.log("vnode1 "+vnode1.id+" "+
//		  vnode1.pins[0].node+" "+vnode1.pins[1].node+" "+
//		  vnode1.pins[0].end+" "+vnode1.pins[1].end);
//		console.log("vnode2 "+vnode2.id+" "+
//		  vnode2.pins[0].node+" "+vnode2.pins[1].node+" "+
//		  vnode2.pins[0].end+" "+vnode2.pins[1].end);
		if (end1 == 1)
			reverse(vnode1);
		if (end2 == 0)
			reverse(vnode2);
		for (let j=0; j<vnode2.sections.length; j++) {
			let sec= vnode2.sections[j];
			vnode1.sections.push(sec);
		}
		vnode1.pins[1].node= vnode2.pins[1].node;
		vnode1.pins[1].end= vnode2.pins[1].end;
		vnode2.delete= true;
		enode1.delete= true;
		enode2.delete= true;
		let onode= tdb1.nodes[vnode1.pins[1].node];
		for (let j=0; j<onode.pins.length; j++) {
			let pin= onode.pins[j];
			if (pin.node == vnode2.id) {
				pin.node= vnode1.id;
//				console.log("onode "+onode.id+" "+j);
			}
		}
//		console.log("vnode1 "+vnode1.id+" "+
//		  vnode1.pins[0].node+" "+vnode1.pins[1].node+" "+
//		  vnode1.pins[0].end+" "+vnode1.pins[1].end);
	}
	// remove deleted node and renumber references
	let newNodes= [ null ];
	for (let i=1; i<tdb1.nodes.length; i++) {
		let node= tdb1.nodes[i];
		if (node.delete)
			continue;
		node.id= newNodes.length;
		newNodes[node.id]= node;
	}
	for (let i=1; i<newNodes.length; i++) {
		let node= newNodes[i];
		for (let j=0; j<node.pins.length; j++) {
			let pin= node.pins[j];
			pin.node= tdb1.nodes[pin.node].id;
		}
	}
	tdb1.nodes= newNodes;
}

let mapTerrainColor= function(value,color)
{
	let x= value/255;
	return 255*(.7*x + .1*x*x);
}

//	Implements the File menu Save Tile Image feature.
//	Creates a canvas with the image for the current center tile and
//	then saves it as a png file and updates the .t file.
let saveTileImage= function()
{
	let tx= centerTX + Math.round(centerU/2048);
	let tz= centerTZ + Math.round(centerV/2048);
	let tile= findTile(tx,tz);
	let canvas= document.createElement("canvas");
	let sz= document.getElementById("tileimagesize").value;
	canvas.width= sz;
	canvas.height= sz;
	let cu= 2048*(tx-centerTX);
	let cv= 2048*(tz-centerTZ);
	let scale= sz/2048;
	console.log("save tile image "+tx+" "+tz+" "+cu+" "+cv+" "+
	  tile.filename);
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
	let badColor= function(pixel) {
		let r= pixel[0];
		let g= pixel[1];
		let b= pixel[2];
		if  (r>g && r>b) {
			let c= r - (g<b ? g : b);
			if (c < 8)
				return false;
			return true;
		}
		if (g>r && g>b) {
			let c= g - (r<b ? r : b);
			if (c < 8)
				return false;
			let h= (b-r)/c;
			return h<1.2;
		}
		let c= b - (r<g ? r : g);
		if (c < 8)
			return false;
		let h= (r-g)/c;
		return h>4.8;
	}
	let addColor= function(x,y,pout) {
		let pixel= context.getImageData(x,y,1,1).data;
		if (badColor(pixel))
			return false;
		for (let i=0; i<3; i++)
			pout[i]+= pixel[i];
		return true;
	}
//	for (let i=0; false && i<10 && mapType=="imagerytopo"; i++) {
	for (let i=0; i<1; i++) {
		let nchg= 0;
		for (let x=0; x<sz; x++) {
			for (let y=0; y<sz; y++) {
				let idata= context.getImageData(x,y,1,1);
				let pixel= idata.data;
				for (let j=0; j<3; j++) {
					pixel[j]= mapTerrainColor(pixel[j],j);
				}
				context.putImageData(idata,x,y);
				nchg++;
			}
		}
		console.log(" fix "+i+" "+nchg);
		if (nchg == 0)
			break;
	}
	let dataUrl= canvas.toDataURL();
//	let dataUrl= canvas.toDataURL("image/dds");
//	console.log(dataUrl.substr(0,60));
	let start= dataUrl.indexOf("base64,");
	let buf= Buffer.from(dataUrl.substr(start+6),"base64");
	let path= routeDir+fspath.sep+'TERRTEX'+fspath.sep+"t"+tile.filename+
	  ".png";
//	console.log(path);
	fs.writeFileSync(path,buf);
	createTFile(tile,"t"+tile.filename+".ace");
	if (tile.patchModels) {
		let mtcanvas= document.createElement("canvas");
		mtcanvas.width= 256;
		mtcanvas.height= 256;
		var microtex= document.getElementById("microtex");
		let mtcontext= mtcanvas.getContext("2d");
		mtcontext.drawImage(microtex,0,0);
		let mtdata= mtcontext.getImageData(0,0,256,256).data;
		for (let i=0; i<tile.patchModels.length; i++)
			savePatchImage(tile,tile.patchModels[i],mtdata);
	}
}

let savePatchImage= function(tile,tpm,mtdata)
{
	let canvas= document.createElement("canvas");
	let sz= document.getElementById("tileimagesize").value;
	canvas.width= sz;
	canvas.height= sz;
	let cu= 2048*(tile.x-centerTX) - 1024+64 + tpm[1]*128;
	let cv= 2048*(tile.z-centerTZ) + 1024-64 - tpm[0]*128;
	let scale= sz/(2048/16);
//	console.log("save patch image "+tile.x+" "+tile.z+" "+cu+" "+cv+" "+
//	  mtdata.length);
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
	for (let i=0; i<sz; i+=256) {
		for (let j=0; j<sz; j+=256) {
			let idata= context.getImageData(i,j,256,256);
			let data= idata.data;
			for (let k=0; k<mtdata.length; k++) {
				if (k%4 != 3)
					data[k]= mapTerrainColor(data[k],k);
				let v= 2*data[k]*mtdata[k]/255;
				if (v < 0)
					v= 0;
				else if (v > 255)
					v= 255;
				data[k]= v;
			}
			context.putImageData(idata,i,j);
		}
	}
	let x0= 2048*(tile.x-centerTX);
	let z0= 2048*(tile.z-centerTZ);
	let i0= tpm[0]*16;
	let j0= tpm[1]*16;
	let minX= x0 + 8*(j0-128) - 10;
	let maxX= x0 + 8*(j0+16-128) + 10;
	let minY= z0 + 8*(128-16-i0) - 10;
	let maxY= z0 + 8*(128-i0) + 10;
//	console.log("bound "+minX+" "+maxX+" "+minY+" "+maxY+" "+
//          x0+" "+z0+" "+i0+" "+j0);
	let profiles = {
	  branch: { width: 2.6, fill: "#666", alpha: .7 },
	  yard: { width: 2.75, fill: "#666", alpha: .7 },
	  main: { width: 2.75, fill: "#666", alpha: .7 },
	  road: { width: 4, fill: "#666", alpha: 1 },
	  dirtroad: { width: 4, fill: "#765", alpha: .9 },
	  dirtroad1: { width: 2.7, fill: "#765", alpha: .9 }
	};
	let profile= null;
	let wid= 0;
	let setProfile= function(type) {
		if (type && profiles[type])

			profile= profiles[type];
		else
			profile= profiles.branch;
//		console.log("setprof "+type+" "+profile.cut.depth);
		wid= profile.width*scale;
		context.fillStyle= profile.fill;
		context.globalAlpha= profile.alpha;
	}
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track.type == "water" || track.type=="contour")
			continue;
		setProfile(track.type);
		let controlPoints= track.controlPoints;
		let trackPoints= track.trackPoints;
		for (let j=0; j<controlPoints.length-1; j++) {
			let cp0= controlPoints[j];
			let cp1= controlPoints[j+1];
			if (cp0.bridge) {
				for (let k=cp0.trackPoint; k<cp1.trackPoint;
				  k++) {
					trackPoints[k].bridge= true;
				}
			}
		}
		let p0= trackPoints[0];
		for (let j=1; j<trackPoints.length; j++) {
			let p1= trackPoints[j];
			if ((p0.x<minX && p1.x<minX) ||
			  (p0.x>maxX && p1.x>maxX) ||
			  (p0.y<minY && p1.y<minY) ||
			  (p0.y>maxY && p1.y>maxY)) {
				p0= p1;
				continue;
			}
			if (p0.bridge) {
				p0= p1;
				continue;
			}
			let perp= new THREE.Vector2(p0.y-p1.y,p1.x-p0.x);
			perp.normalize();
			context.beginPath();
			let x= (p0.x-cu)*scale + width/2;
			let y= height/2 - (p0.y-cv)*scale;
//			console.log("xy "+x+" "+y+" "+wid);
			context.moveTo(x+wid*perp.x,y-wid*perp.y);
			context.lineTo(x-wid*perp.x,y+wid*perp.y);
			x= (p1.x-cu)*scale + width/2;
			y= height/2 - (p1.y-cv)*scale;
			context.lineTo(x-wid*perp.x,y+wid*perp.y);
			context.lineTo(x+wid*perp.x,y-wid*perp.y);
			context.closePath();
			context.fill();
			p0= p1;
		}
	}
	for (let i=0; i<switches.length; i++) {
		let sw= switches[i];
		let p0= sw.points[0].position;
		let p1= sw.points[1].position;
		let p2= sw.points[2].position;
		let track0= findTrack(sw.points[0]);
		let track1= findTrack(sw.points[1]);
		let track2= findTrack(sw.points[2]);
		if ((p0.x<minX && p1.x<minX) ||
		  (p0.x>maxX && p1.x>maxX) ||
		  (p0.y<minY && p1.y<minY) ||
		  (p0.y>maxY && p1.y>maxY)) {
			continue;
		}
//		console.log("sw "+i);
		let d1= p1.clone().sub(p0);
		d1.normalize();
		let d2= p2.clone().sub(p0);
		d2.normalize();
		p0= p0.clone().sub(d1);
		p1= p1.clone().add(d1);
		p2= p2.clone().add(d2);
		let perp= new THREE.Vector2(p0.y-p1.y,p1.x-p0.x);
		perp.normalize();
		setProfile(track1.type);
		context.beginPath();
		let x= (p0.x-cu)*scale + width/2;
		let y= height/2 - (p0.y-cv)*scale;
		context.moveTo(x+wid*perp.x,y-wid*perp.y);
		context.lineTo(x-wid*perp.x,y+wid*perp.y);
		x= (p1.x-cu)*scale + width/2;
		y= height/2 - (p1.y-cv)*scale;
		context.lineTo(x-wid*perp.x,y+wid*perp.y);
		context.lineTo(x+wid*perp.x,y-wid*perp.y);
		context.closePath();
		context.fill();
		perp= new THREE.Vector2(p0.y-p2.y,p2.x-p0.x);
		perp.normalize();
		setProfile(track2.type);
		context.beginPath();
		x= (p0.x-cu)*scale + width/2;
		y= height/2 - (p0.y-cv)*scale;
		context.moveTo(x+wid*perp.x,y-wid*perp.y);
		context.lineTo(x-wid*perp.x,y+wid*perp.y);
		x= (p2.x-cu)*scale + width/2;
		y= height/2 - (p2.y-cv)*scale;
		context.lineTo(x-wid*perp.x,y+wid*perp.y);
		context.lineTo(x+wid*perp.x,y-wid*perp.y);
		context.closePath();
		context.fill();
	}
	for (let i=0; false && i<sz; i+=256) {
		for (let j=0; j<sz; j+=256) {
			let idata= context.getImageData(i,j,256,256);
			let data= idata.data;
			for (let k=0; k<mtdata.length; k++) {
				if (k%4 != 3)
					data[k]= mapTerrainColor(data[k],k);
				let v= 2*data[k]*mtdata[k]/255;
				if (v < 0)
					v= 0;
				else if (v > 255)
					v= 255;
				data[k]= v;
			}
			context.putImageData(idata,i,j);
		}
	}
	let dataUrl= canvas.toDataURL();
	let start= dataUrl.indexOf("base64,");
	let buf= Buffer.from(dataUrl.substr(start+6),"base64");
	let path= routeDir+fspath.sep+'TEXTURES'+fspath.sep+"t"+tile.filename+
	  "_"+tpm[0]+"_"+tpm[1]+".png";
	fs.writeFileSync(path,buf);
}

let makeQuadTree= function()
{
	let nodes= [];
	let findNode= function(x,z,level) {
		for (let i=0; i<nodes.length; i++) {
			let node= nodes[i];
			if (node.x==x && node.z==z && node.level==level)
				return node;
		}
		let node= {
			x: x,
			z: z,
			level: level,
			children: [null,null,null,null]
		}
		nodes.push(node);
		return node;
	}
	let addToParent= function(node)
	{
		let n= Math.pow(2,node.level);
		let c= 0;
		let pz= Math.floor(node.z/2);
		let x1= node.x+n;
		let x2= Math.floor(x1/2);
		let px= x2-n/2;
		if (x1 > 2*x2)
			c+= 1;
		if (node.z > 2*pz)
			c= 3-c;
//		console.log("parent "+node.level+" "+node.x+" "+node.z+" "+
//		  px+" "+pz+" "+c);
		let parent= findNode(px,pz,node.level-1);
		parent.children[c]= node;
		if (parent.level > 6)
			addToParent(parent);
	}
	for (let i=0; i<tiles.length; i++) {
		let tile= tiles[i];
		tile.level= 15;
		addToParent(tile);
	}
	let writeTDFile= function(top) {
		let countChildren= function(node) {
			if (!node.children)
				return 0;
			let n= 1;
			for (let i=0; i<node.children.length; i++)
				if (node.children[i])
					n+= countChildren(node.children[i]);
			return n;
		}
		let nNodes= countChildren(top);
		let path= routeDir+fspath.sep+"TD"+fspath.sep+
		  tileCoordToStr(top.x,5)+tileCoordToStr(top.z,5)+".td";
		const fd= fs.openSync(path,"w");
		if (!fd)
			throw 'cannot create file '+path;
		fs.writeSync(fd,"SIMISA@@@@@@@@@@JINX0d1b______\r\n");
		const buf= Buffer.alloc(4);
		// writes a 4 byte int to the file
		let writeInt= function(n)
		{
			buf.writeInt32LE(n,0);
			return fs.writeSync(fd,buf,0,4);
		}
		// writes a 1 byte int to the file
		let writeByte= function(b)
		{
			buf.writeUInt8(b,0);
			return fs.writeSync(fd,buf,0,1);
		}
		// writes 4 byte code and length values to the file
		// and a zero length label
		let writeCodeLen= function(code,len)
		{
			let n= writeInt(code);
			n+= writeInt(len);
			n+= writeByte(0);
			return n;
		}
		writeCodeLen(132,nNodes+5+9);
		writeCodeLen(135,nNodes+5);
		writeInt(nNodes);
		let byteOrder= [ 3, 2, 1, 0 ];
		let writeTree= function(node) {
			if (!node.children)
				return;
			let byte= 0;
			for (let i=0; i<node.children.length; i++) {
				if (node.children[i])
					byte+= 1<<i;
			}
			if (byte == 0)
				return;
			if (node.level < 14)
				byte*= 16;
//			console.log("byte "+byte.toString(16));
//			if (byte < 16)
//				byte= 15;
			writeByte(byte);
			for (let i=0; i<node.children.length; i++) {
				let j= byteOrder[i];
				if (node.children[j])
					writeTree(node.children[j]);
			}
		}
		writeTree(top);
		fs.closeSync(fd);
	}
	for (let i=0; i<nodes.length; i++) {
		let node= nodes[i];
		if (node.level==6) {
//			console.log("top "+node.x+" "+node.z);
			writeTDFile(node);
		}
	}
	let path= routeDir+fspath.sep+"TD"+fspath.sep+"td_idx.dat";
	const fd= fs.openSync(path,"w");
	const bom= Buffer.alloc(2);
	bom.writeUInt16LE(0xfeff,0);
	fs.writeSync(fd,bom,0,2);
	fs.writeSync(fd,"SIMISA@@@@@@@@@@JINX0D0t______\r\n",null,"utf16le");
	fs.writeSync(fd,"\r\n",null,"utf16le");
	fs.writeSync(fd,"terrain_desc (\r\n",null,"utf16le");
	fs.writeSync(fd,"\tterrain_desc_size ( 67108864 )\r\n",null,"utf16le");
	fs.writeSync(fd,"\tDepth ( 6 )\r\n",null,"utf16le");
	fs.writeSync(fd,"\tterrain_desc_tiles (\r\n",null,"utf16le");
	for (let i=0; i<nodes.length; i++) {
		let node= nodes[i];
		if (node.level==6) {
			fs.writeSync(fd,"\t\tTdFile ( "+node.x+" "+node.z+
			  " )\r\n",null,"utf16le");
		}
	}
	fs.writeSync(fd,"\t)\r\n",null,"utf16le");
	fs.writeSync(fd,")\r\n",null,"utf16le");
	fs.closeSync(fd);
}

let saveTileCutFill= function()
{
	setContourElevation();
	let tx= centerTX + Math.round(centerU/2048);
	let tz= centerTZ + Math.round(centerV/2048);
	let tile= findTile(tx,tz);
	if (!tile)
		return;
	let path= routeDir+fspath.sep+"TILES"+fspath.sep+tile.filename;
	tile.patchModels= [];
	calcTrackPointElevations();
	let faces= findTrackFaces("yard");
	for (let i=0; i<16; i++) {
		for (let j=0; j<16; j++) {
			let i0= i*16;
			let j0= j*16;
//			if (i!=0 || j!=11)
//				continue;
			if (countPatchTrackPoints(tile,i0,j0) < 1)
				continue;
			let ppath= path+"_"+i+"_"+j;
			console.log("patch "+tx+" "+tz+" "+i+" "+j+" "+i0+
			  " "+j0+" "+countPatchTrackPoints(tile,i0,j0));
			let model= makePatchModel(tile,i0,j0);
			console.log(" polys "+model.polygons.length);
			let nextID= 1024;
			let fill= makeCutFillModel(tile,i0,j0,false,nextID,
			  faces,false);
			console.log(" fill polys "+fill.polygons.length);
			nextID+= fill.polygons.length;
			let cut= makeCutFillModel(tile,i0,j0,true,nextID,
			  faces,false);
			for (let k=0; k<cut.length; k++)
				nextID+= cut[k].length;
			let opCut= makeCutFillModel(tile,i0,j0,true,nextID,
			  faces,true);
			console.log(" opcut csgs "+opCut.length);
			let bBox= CSG.cube({
			  center: [8*(j0+8-128),8*(128-8-i0), 10000],
			  radius: [64,64,10000]});
			console.log(" bbox "+bBox.polygons.length);
			//writeCsgObj(ppath+"_bbox.obj",bBox);
			let fbox= clipPolygons(fill,bBox,false);
			console.log(" fbox "+fbox.polygons.length);
			//writeCsgObj(ppath+"_fbox.obj",fbox);
//			model= model.intersect(bBox);
//			console.log(" after intersect "+model.polygons.length);
//			if (cut.polygons.length > 0)
//				model= model.subtract(cut);
//			console.log(" polys after cut "+model.polygons.length);
//			fill= fill.intersect(bBox);
//			if (fill.polygons.length > 0)
//				model= model.union(fill);
//			console.log(" polys after fill "+model.polygons.length);
			model= cutFillBySquare(i0,j0,model,cut,fbox,tx,tz,
			  opCut);
			console.log(" polys "+model.polygons.length);
			writeCsgObj(ppath+".obj",model,i,j);
			tile.patchModels.push([i,j]);
//			for (let k=0; k<cut.polygons.length; k++)
//				merge.polygons.push(cut.polygons[k]);
//			for (let k=0; k<fill.polygons.length; k++)
//				merge.polygons.push(fill.polygons[k]);
//			writeCsgObj(ppath+"_merge.obj",merge);
//			let c1= CSG.cube({center:[0,0,0],radius:[1,1,1]});
//			let c2= CSG.cube({center:[.5,.4,.6],radius:[1,1,1]});
//			let ccu= c1.union(c2);
//			let ccs= c1.subtract(c2);
//			let cci= c1.intersect(c2);
//			writeCsgObj(ppath+"_ccu.obj",ccu);
//			writeCsgObj(ppath+"_ccs.obj",ccs);
//			writeCsgObj(ppath+"_cci.obj",cci);
//			return;
		}
	}
	createTFile(tile,"t"+tile.filename+".ace");
	console.log("done");
}

let countPatchTrackPoints= function(tile,i0,j0)
{
	let x0= 2048*(tile.x-centerTX);
	let z0= 2048*(tile.z-centerTZ);
	let minX= x0 + 8*(j0-128) - 10;
	let maxX= x0 + 8*(j0+16-128) + 10;
	let minY= z0 + 8*(128-16-i0) - 10;
	let maxY= z0 + 8*(128-i0) + 10;
	let n= 0;
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track.type == "water" || track.type=="contour")
			continue;
		track.nearPatch= false;
		let m= 0;
		if (track.controlPoints.length == 1) {
			let point= track.controlPoints[0];
			if (point.model && point.model.size) {
				let x= point.position.x;
				let y= point.position.y;
				let w= point.model.size.w/2;
				let h= point.model.size.h/2;
				let r= Math.sqrt(w*w+h*h)+10;
				if ((x-r<minX && x+r<minX) ||
				  (x-r>maxX && x+r>maxX) ||
				  (y-r<minY && y+r<minY) ||
				  (y-r>maxY && y+r>maxY))
					continue;
				m++;
			}
		}
		let trackPoints= track.trackPoints;
		for (let j=1; j<trackPoints.length; j++) {
			let p0= trackPoints[j-1];
			let p1= trackPoints[j];
			if ((p0.x<minX && p1.x<minX) ||
			  (p0.x>maxX && p1.x>maxX) ||
			  (p0.y<minY && p1.y<minY) ||
			  (p0.y>maxY && p1.y>maxY))
				continue;
			m++;
		}
		if (m > 0) {
			n+= m;
			track.nearPatch= true;
		}
	}
	return n;
}

let makePatchModel= function(tile,i0,j0)
{
	let x0= 2048*(tile.x-centerTX);
	let z0= 2048*(tile.z-centerTZ);
	let verts= [];
	let normal= new CSG.Vector([0,0,1]);
	for (let i=0; i<=16; i++) {
		for (let j=0; j<=16; j++) {
			let x= x0 + 8*(j0+j-128);
			let y= z0 + 8*(128-i-i0);
			x= 8*(j0+j-128);
			y= 8*(128-i-i0);
			let z= getTerrainElevation(i+i0,j+j0,tile,true);
			verts.push(new CSG.Vertex(new CSG.Vector(x,y,z),
			  normal));
		}
	}
	verts.push(new CSG.Vertex(new CSG.Vector(8*(j0-128),8*(128-i0),0),
	  normal));
	verts.push(new CSG.Vertex(new CSG.Vector(8*(j0+16-128),8*(128-i0),0),
	  normal));
	verts.push(new CSG.Vertex(new CSG.Vector(8*(j0-128),8*(128-16-i0),0),
	  normal));
	verts.push(new CSG.Vertex(new CSG.Vector(8*(j0+16-128),8*(128-16-i0),0),
	  normal));
	console.log(" verts "+verts.length);
	let printVert= function(name,v) {
		console.log(name+" "+v.pos.x+" "+v.pos.y+" "+v.pos.z);
	}
	let polys= [];
	let pid= 1;
	for (let i=0; i<16; i++) {
		let k= i*17;
		for (let j=0; j<16; j++) {
			let kj= k+j;
			let v00= verts[kj];
			let v01= verts[kj+1];
			let v10= verts[kj+17];
			let v11= verts[kj+17+1];
			if (Math.abs(v11.pos.z-v00.pos.z) <
			  Math.abs(v10.pos.z-v01.pos.z)) {
				polys.push(
				  new CSG.Polygon([v00,v10,v11],pid++));
				polys.push(
				  new CSG.Polygon([v11,v01,v00],pid++));
			} else {
				polys.push(
				  new CSG.Polygon([v00,v10,v01],pid++));
				polys.push(
				  new CSG.Polygon([v01,v10,v11],pid++));
			}
//			if ((i==0 && j==0) || (i==15 && j==15)) {
//				console.log("ij "+i+" "+j+" "+k+" "+kj);
//				printVert(" 00",v00);
//				printVert(" 01",v01);
//				printVert(" 10",v10);
//				printVert(" 11",v11);
//			}
		}
	}
	let m= verts.length-4;
	let addPoly= function(i1,i2,i3) {
		polys.push(new CSG.Polygon([verts[i1],verts[i2],verts[i3]],0));
	}
	addPoly(m,m+1,m+3);
	addPoly(m,m+3,m+2);
	addPoly(m,0,m+1);
	addPoly(m+2,m+3,17*16);
	addPoly(m,m+2,0);
	addPoly(m+1,16,m+3);
	for (let i=0; i<16; i++) {
		addPoly(i,i+1,m+1);
		addPoly(i+17*16,m+3,i+1+17*16);
		addPoly(i*17,m+2,i*17+17);
		addPoly(16+i*17,16+i*17+17,m+3);
	}
	return CSG.fromPolygons(polys);
}

let makeCutFillModel= function(tile,i0,j0,cut,pid0,faces,overpass)
{
	let profiles = {
	  branch: {
		cut: { depth: .3, width: 3.2, slope: 1 },
		fill: { depth: 0, width: 2.75, slope: 1.5 },
	  },
	  yard: {
		cut: { depth: 0, width: 5, slope: 1 },
		fill: { depth: 0, width: 2.75, slope: 1.5 },
	  },
	  main: {
		cut: { depth: 1, width: 3.2, slope: 1 },
		fill: { depth: 0, width: 2.75, slope: 1.5 },
	  },
	  road: {
		cut: { depth: 1, width: 6, slope: 1 },
		fill: { depth: 0, width: 5, slope: 1.5 },
	  },
	  dirtroad: {
		cut: { depth: .5, width: 6, slope: 1 },
		fill: { depth: 0, width: 5, slope: 1.5 },
	  },
	  dirtroad1: {
		cut: { depth: .3, width: 3, slope: 1 },
		fill: { depth: 0, width: 2.5, slope: 1.5 },
	  }
	};
	let profile= profiles.branch;
	let normal= new CSG.Vector([0,0,1]);
	let polys= [];
	let verts= [];
	let csgs= [];
	let x0= 2048*(tile.x-centerTX);
	let z0= 2048*(tile.z-centerTZ);
	let minX= x0 + 8*(j0-128) - 10;
	let maxX= x0 + 8*(j0+16-128) + 10;
	let minY= z0 + 8*(128-16-i0) - 10;
	let maxY= z0 + 8*(128-i0) + 10;
//	console.log("min "+(minX-x0)+" "+(maxX-x0)+" "+(minY-z0)+" "+(maxY-z0));
	let minZ= 1e10;
	let maxZ= -1e10;
	let addVerts= function(p,dx,dy) {
//		if (!cut)
//		console.log("addverts "+verts.length+" "+
//		  p.x+" "+p.y+" "+p.z+" "+dx+" "+dy);
		let prof= cut ? profile.cut : profile.fill;
		let x= p.x-x0;
		let y= p.y-z0;
		let z= p.z - prof.depth;
		let m1= prof.width;
		const depth= 15;
		let m2= prof.width + depth*prof.slope;
		if (overpass) {
			m2= m1;
			z= p.z + .001;
		}
		let dz= cut ? depth : -depth;
//		console.log("addverts "+prof.depth+" "+m1+" "+m2+" "+dz);
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x-m2*dx,y-m2*dy,z+dz]),normal));
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x-m1*dx,y-m1*dy,z]),normal));
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x+m1*dx,y+m1*dy,z]),normal));
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x+m2*dx,y+m2*dy,z+dz]),normal));
		if (minZ > z)
			minZ= z;
		if (maxZ < p.z)
			maxZ= z;
	}
	let addPoly= function(i1,i2,i3,assignPID) {
//		console.log("addpoly "+verts.length+" "+polys.length+
//		 " "+i1+" "+i2+" "+i3);
		let poly=  new CSG.Polygon([verts[i1],verts[i2],verts[i3]],
		  (assignPID?pid0+polys.length:0));
		polys.push(poly);
//		if (assignPID && poly.plane.normal.z<0 && !cut)
//			console.log("negpoly "+verts.length+" "+polys.length+
//			  " "+i1+" "+i2+" "+i3+" "+poly.plane.normal.z);
	}
	let addPolys= function() {
		let m= verts.length-8;
		if (cut) {
			addPoly(m,m+5,m+4,true);
			addPoly(m,m+1,m+5,true);
			addPoly(m+1,m+6,m+5,true);
			addPoly(m+1,m+2,m+6,true);
			addPoly(m+2,m+7,m+6,true);
			addPoly(m+2,m+3,m+7,true);
			addPoly(m,m+4,m+7,false);
			addPoly(m,m+7,m+3,false);
		} else {
			addPoly(m,m+4,m+1,true);
			addPoly(m+1,m+4,m+5,true);
			addPoly(m+1,m+5,m+2,true);
			addPoly(m+2,m+5,m+6,true);
			addPoly(m+2,m+6,m+3,true);
			addPoly(m+3,m+6,m+7,true);
			addPoly(m,m+3,m+7,false);
			addPoly(m,m+7,m+4,false);
		}
	}
	let addEnd= function(flip,assignPID) {
		let m= verts.length-4;
		if ((cut && !flip) || (!cut && flip)) {
			addPoly(m,m+2,m+1,assignPID);
			addPoly(m,m+3,m+2,assignPID);
		} else {
			addPoly(m,m+1,m+2,assignPID);
			addPoly(m,m+2,m+3,assignPID);
		}
	}
	let saveCutCSGUnion= function() {
		if (cut && polys.length>0) {
			let csg= new CSG.fromPolygons(polys);
			polys= [];
			csgs.push(csg);
//			console.log("union "+csg.polygons.length+" "+
//			  csgs.length);
		}
	}
	let setProfile= function(type) {
		if (type && profiles[type])
			profile= profiles[type];
		else
			profile= profiles.branch;
//		console.log("setprof "+type+" "+profile.cut.depth);
	}
	let addModelCutFill= function(point) {
		if (overpass)
			return;
		if (!point.direction || !point.model || !point.model.size)
			return;
		let x= point.position.x;
		let y= point.position.y;
		let dx= point.direction.x;
		let dy= point.direction.y;
		let w= point.model.size.w/2;
		let h= point.model.size.h/2;
		let r= Math.sqrt(w*w+h*h)+10;
		if ((x-r<minX && x+r<minX) ||
		  (x-r>maxX && x+r>maxX) ||
		  (y-r<minY && y+r<minY) ||
		  (y-r>maxY && y+r>maxY))
			return;
		x= x-x0;
		y= y-z0;
		let z= point.position.z;
		let px= -dy;
		let py= dx;
//		console.log("model "+x+" "+y+" "+dx+" "+dy+" "+w+" "+h);
		const depth= 10;
		let slope= cut ? 3 : 2;
		if (point.model.slope)
			slope= point.model.slope;
		let m2= depth*slope;
		let w2= w + depth*slope;
		let h2= h + depth*slope;
		let dz= cut ? depth : -depth;
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x-w2*dx-h2*px,y-w2*dy-h2*py,z+dz]),normal));
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x-w*dx-h*px,y-w*dy-h*py,z]),normal));
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x-w*dx+h*px,y-w*dy+h*py,z]),normal));
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x-w2*dx+h2*px,y-w2*dy+h2*py,z+dz]),normal));
		addEnd(false,true);
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x+w2*dx-h2*px,y+w2*dy-h2*py,z+dz]),normal));
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x+w*dx-h*px,y+w*dy-h*py,z]),normal));
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x+w*dx+h*px,y+w*dy+h*py,z]),normal));
		verts.push(new CSG.Vertex(new CSG.Vector(
		  [x+w2*dx+h2*px,y+w2*dy+h2*py,z+dz]),normal));
		addPolys();
		addEnd(true,true);
//		for (let i=verts.length-8; i<verts.length; i++) {
//			let v= verts[i];
//			console.log("v "+i+" "+v.pos.x+" "+v.pos.y+" "+v.pos.z);
//		}
	}
	let addTurntable= function(point,radius) {
		if (overpass)
			return;
		let prof= cut ? profile.cut : profile.fill;
		let x= point.position.x;
		let y= point.position.y;
		let r= radius+prof.width;
		if ((x-r<minX && x+r<minX) ||
		  (x-r>maxX && x+r>maxX) ||
		  (y-r<minY && y+r<minY) ||
		  (y-r>maxY && y+r>maxY))
			return;
		x= x-x0;
		y= y-z0;
		let z= point.position.z;
		if (cut)
			z-= 2;
		else
			z+= .1;
		const depth= 10;
		let slope= cut ? 3 : 2;
		let r1= radius-.5;
		let r2= r + depth*slope;
		let dz= cut ? depth : -depth;
//		console.log("turntable "+x+" "+y+" "+radius);
		for (let i=0; i<=360; i+=10) {
			let a= i*Math.PI/180;
			let cs= Math.cos(a);
			let sn= Math.sin(a);
			verts.push(new CSG.Vertex(new CSG.Vector(
			  [x+r2*cs,y+r2*sn,z+dz]),normal));
			verts.push(new CSG.Vertex(new CSG.Vector(
			  [x+r*cs,y+r*sn,z]),normal));
			verts.push(new CSG.Vertex(new CSG.Vector(
			  [x+r1*cs,y+r1*sn,z]),normal));
			if (cut) 
				verts.push(new CSG.Vertex(new CSG.Vector(
				  [x,y,z]),normal));
			else
				verts.push(new CSG.Vertex(new CSG.Vector(
				  [x+r1*cs,y+r1*sn,z+dz]),normal));
			if (i > 0)
				addPolys();
		}
		saveCutCSGUnion();
	}
	let noverpass= 0;
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track.type == "water" || track.type=="contour")
			continue;
		setProfile(track.type);
		let controlPoints= track.controlPoints;
		let trackPoints= track.trackPoints;
		for (let j=0; j<controlPoints.length-1; j++) {
			let cp0= controlPoints[j];
			let cp1= controlPoints[j+1];
			if (cp0.bridge) {
				for (let k=cp0.trackPoint; k<cp1.trackPoint;
				  k++) {
					trackPoints[k].bridge= true;
					//console.log("bridgetp "+k);
				}
				if (cp0.bridge=="turntable")
					addTurntable(cp0,
					  cp1.distance-cp0.distance);
			}
			if (cp0.overpass) {
				for (let k=cp0.trackPoint; k<cp1.trackPoint;
				  k++) {
					trackPoints[k].overpass= true;
				}
			}
		}
		let print= false;
		let closeEnd= true;//false;
		let prev= -1;
		let p0= trackPoints[0];
		for (let j=1; j<trackPoints.length; j++) {
			let p1= trackPoints[j];
			if (p1.distanceTo(p0) < .1) {
//				if (print)
//				console.log("close "+j+" "+prev+" "+
//				  p0.bridge+" "+p1.bridge);
				prev++;
				continue;
			}
			if ((p0.x<minX && p1.x<minX) ||
			  (p0.x>maxX && p1.x>maxX) ||
			  (p0.y<minY && p1.y<minY) ||
			  (p0.y>maxY && p1.y>maxY)) {
				p0= p1;
				continue;
			}
			if (overpass ? !p0.overpass : p0.bridge) {
//				console.log("bridge "+j+" "+prev+" "+
//				  p0.bridge+" "+p1.bridge);
				p0= p1;
				print= true;
				closeEnd= true;
				continue;
			}
//			if (print)
//				console.log("nobridge "+j+" "+prev+" "+
//				  p0.bridge+" "+p1.bridge);
			if (p0.overpass)
				noverpass++;
			print = false;
//			console.log(" tp "+j+" "+prev+" "+p0.straight+" "+
//			  p1.straight+" "+
//			  tracks[i].controlPoints[0].position.z+" "+p1.z);
			let perp= new THREE.Vector2(p0.y-p1.y,p1.x-p0.x);
			perp.normalize();
			if (prev != j-1) {
				if (polys.length > 0)
					addEnd(true,closeEnd);
				addVerts(p0,perp.x,perp.y);
				addEnd(false,closeEnd);
				closeEnd= true;//false;
			}
			addVerts(p1,perp.x,perp.y);
			prev= j;
			p0= p1;
			let m= verts.length-8;
			if (cut) {
				addPoly(m,m+5,m+4,true);
				addPoly(m,m+1,m+5,true);
				addPoly(m+1,m+6,m+5,true);
				addPoly(m+1,m+2,m+6,true);
				addPoly(m+2,m+7,m+6,true);
				addPoly(m+2,m+3,m+7,true);
				addPoly(m,m+4,m+7,false);
				addPoly(m,m+7,m+3,false);
			} else {
				addPoly(m,m+4,m+1,true);
				addPoly(m+1,m+4,m+5,true);
				addPoly(m+1,m+5,m+2,true);
				addPoly(m+2,m+5,m+6,true);
				addPoly(m+2,m+6,m+3,true);
				addPoly(m+3,m+6,m+7,true);
				addPoly(m,m+3,m+7,false);
				addPoly(m,m+7,m+4,false);
			}
		}
		if (polys.length > 0)
			addEnd(true,true);
		if (controlPoints.length == 1)
			addModelCutFill(controlPoints[0]);
		if (overpass && polys.length>0)
			console.log(" oppolys "+polys.length+" "+i+" "+
			  controlPoints.length+" "+trackPoints.length);
		saveCutCSGUnion();
	}
	if (overpass)
		console.log("noverpass "+noverpass);
	for (let i=0; !overpass && i<switches.length; i++) {
		let sw= switches[i];
		let p0= sw.points[0].position;
		let p1= sw.points[1].position;
		let p2= sw.points[2].position;
		let track0= findTrack(sw.points[0]);
		let track1= findTrack(sw.points[1]);
		let track2= findTrack(sw.points[2]);
		if ((p0.x<minX && p1.x<minX) ||
		  (p0.x>maxX && p1.x>maxX) ||
		  (p0.y<minY && p1.y<minY) ||
		  (p0.y>maxY && p1.y>maxY)) {
			continue;
		}
//		console.log("sw "+i);
		let d1= p1.clone().sub(p0);
		d1.normalize();
		let d2= p2.clone().sub(p0);
		d2.normalize();
		p0= p0.clone().sub(d1);
		p1= p1.clone().add(d1);
		p2= p2.clone().add(d2);
		let perp= new THREE.Vector2(p0.y-p1.y,p1.x-p0.x);
		perp.normalize();
		setProfile(track0.type);
		addVerts(p0,perp.x,perp.y);
		addEnd(false,false);
		setProfile(track1.type);
		addVerts(p1,perp.x,perp.y);
		addEnd(true,false);
		addPolys();
		saveCutCSGUnion();
		perp= new THREE.Vector2(p0.y-p2.y,p2.x-p0.x);
		perp.normalize();
		setProfile(track0.type);
		addVerts(p0,perp.x,perp.y);
		addEnd(false,false);
		setProfile(track2.type);
		addVerts(p2,perp.x,perp.y);
		addEnd(true,false);
		addPolys();
		saveCutCSGUnion();
	}
	let pDist= function(p1,p2){
		let dx= p2.x-p1.x;
		let dy= p2.y-p1.y;
		return Math.sqrt(dx*dx+dy*dy);
	}
	for (let i=0; cut==false && i<faces.length; i++) {
		let face= faces[i];
		let n= 0;
		for (let j=0; j<face.tracks.length; j++)
			if (face.tracks[j].nearPatch)
				n++;
		if (n == 0)
			continue;
		let nVerts= verts.length;
		let points= getFaceTrackPoints(face);
//		console.log("face "+i+" "+points.length);
		for (let j=0; j<points.length; j++) {
			let p= points[j];
			let x= p.x-x0;
			let y= p.y-z0;
			let z= p.z;
			verts.push(new CSG.Vertex(new CSG.Vector(
			  [x,y,z]),normal));
		}
		let j= 0;
		let k= points.length-1;
		let pj0= points[j];
		let pk0= points[k];
		while (k-j > 1) {
//			console.log("jk "+j+" "+k);
			let pj= points[j];
			let pk= points[k];
			let dj= pDist(pj,pj0);
			let dk= pDist(pk,pk0);
			if (dj < dk) {
				let pj1= points[j+1];
				let ccw= triArea(pj.x,pj.y,pj1.x,pj1.y,
				  pk.x,pk.y)>0;
				if (cut ? !ccw : ccw)
					addPoly(j+nVerts,j+1+nVerts,k+nVerts,
					  true);
				else
					addPoly(j+nVerts,k+nVerts,j+1+nVerts,
					  true);
				j++;
			} else {
				let pk1= points[k-1];
				let ccw= triArea(pj.x,pj.y,pk1.x,pk1.y,
				  pk.x,pk.y)>0;
				if (cut ? !ccw : ccw)
					addPoly(j+nVerts,k-1+nVerts,k+nVerts,
					  true);
				else
					addPoly(j+nVerts,k+nVerts,k-1+nVerts,
					  true);
				k--;
			}
		}
	}
	if (cut) {
		if (polys.length > 0)
			csgs.push(new CSG.fromPolygons(polys));
		return csgs;
	} else {
		return new CSG.fromPolygons(polys);
	}
}

let writeCsgObj= function(filename,model,pi,pj)
{
	let uv= true;
	let verts= [];
	let findVert= function(v1) {
		let tol= .001;
		for (let i=0; i<verts.length; i++) {
			let v= verts[i];
			if (v.pos.x-tol<v1.pos.x && v1.pos.x<v.pos.x+tol &&
			  v.pos.y-tol<v1.pos.y && v1.pos.y<v.pos.y+tol &&
			  v.pos.z-tol<v1.pos.z && v1.pos.z<v.pos.z+tol)
				return v;
		}
		return null;
	}
	for (let i=0; i<model.polygons.length; i++) {
		let poly= model.polygons[i];
		if (poly.shared === 0)
			continue;
		for (let j=0; j<poly.vertices.length; j++) {
			let v= poly.vertices[j];
			let v2= findVert(v);
			if (v2) {
				v.id= v2.id;
			} else {
				verts.push(v);
				v.id= verts.length;
			}
		}
	}
	if (verts.length <= 0)
		return;
	console.log("file "+filename);
	const fd= fs.openSync(filename,"w");
	for (let i=0; i<verts.length; i++) {
		let v= verts[i];
		fs.writeSync(fd,"v "+v.pos.x.toFixed(3)+" "+
		  v.pos.y.toFixed(3)+"  "+
		  v.pos.z.toFixed(3)+"\n",null,"utf8");
	}
	if (uv) {
		let minX= 8*(16*pj-128);
		let minY= 8*(128-16*pi);
//		let minY= 8*(128-16-16*pi);
//		minX= 8*(-128);
//		minY= 8*(128-16);
//		minY= 8*(128);
		for (let i=0; i<verts.length; i++) {
			let vert= verts[i];
			let u= (vert.pos.x-minX)/128;
			let v= (minY-vert.pos.y)/128;
//			let u= (vert.pos.x-minX)/2048;
//			let v= (minY-vert.pos.y)/2048;
			fs.writeSync(fd,"vt "+u.toFixed(5)+" "+
			  v.toFixed(5)+"\n",null,"utf8");
		}
	}
	let nneg= 0;
	let printFaceVert= function(v) {
		fs.writeSync(fd," "+v.id,null,"utf8");
		if (uv)
			fs.writeSync(fd,"/"+v.id,null,"utf8");
	}
	for (let i=0; i<model.polygons.length; i++) {
		let poly= model.polygons[i];
		if (poly.shared === 0)
			continue;
		if (poly.plane.normal.z < 0)
			nneg++;
		let v0= poly.vertices[0];
		for (let j=1; j<poly.vertices.length-1; j++) {
			let vj= poly.vertices[j];
			let vj1= poly.vertices[j+1];
			if (v0.id==vj.id || v0.id==vj1.id || vj.id==vj1.id)
				continue;
			fs.writeSync(fd,"f ",null,"utf8");
			printFaceVert(v0);
			printFaceVert(vj);
			printFaceVert(vj1);
			fs.writeSync(fd,"\n",null,"utf8");
		}
	}
	fs.closeSync(fd);
	console.log("close "+filename);
	if (nneg > 0)
		console.log("neg "+filename+" "+nneg);
}

let cutFillBySquare= function(i0,j0,model,cut,fill,tx,tz,opCut)
{
	let polys= [];
	let ncut= 0;
//	for (let i=2; i<4; i++) {
//		for (let j=6; j<12; j++) {
	for (let i=0; i<16; i++) {
		for (let j=0; j<16; j++) {
			let bBox= CSG.cube({
			  center: [8*(j0+j-128)+4,8*(128-i-i0)-4, 10000],
			  radius: [4.001,4.001,10000]});
//			let sq= model.intersect(bBox);
			let sqpolys= [];
			let id= i*32 + j*2 + 1;
			for (let k=0; k<model.polygons.length; k++) {
				let poly= model.polygons[k];
				if (poly.shared===id || poly.shared===id+1)
					sqpolys.push(poly);
			}
			let sq= CSG.fromPolygons(sqpolys);
			let fbox= clipPolygons(fill,bBox);
			if (fbox.polygons.length > 0) {
//				console.log("sq "+i+" "+j+" "+
//				  sq.polygons.length);
//				sq= sq.union(fbox);
				for (let k=0; k<cut.length; k++) {
					let cbox= clipPolygons(cut[k],bBox);
//					console.log("cbox "+cbox.polygons.length);
					if (cbox.polygons.length>0 &&
					  sq.intersect(cbox).polygons.length>0) {
						sq= sq.subtract(cbox);
						ncut++;
//						console.log("cut "+i+" "+j+" "+
//						  sq.polygons.length);
					}
				}
				for (let k=0; k<opCut.length; k++) {
					let cbox= clipPolygons(opCut[k],bBox);
					if (cbox.polygons.length>0 &&
					  fbox.intersect(cbox).polygons.length>0) {
						fbox= fbox.subtract(cbox);
					}
				}
			}
			for (let k=0; k<sq.polygons.length; k++) {
				let poly= sq.polygons[k];
				if (poly.shared > 0) {
					polys.push(poly);
				}
			}
			if (opCut.length > 0) {
				for (let k=0; k<fbox.polygons.length; k++) {
					let poly= fbox.polygons[k];
//					if (poly.shared > 0) {
						polys.push(poly);
//					}
			}
			}
//			console.log("sq "+i+" "+j+" "+sq.polygons.length+
//			  " "+polys.length);
		}
	}
	if (opCut.length == 0) {
		for (let k=0; k<fill.polygons.length; k++) {
			let poly= fill.polygons[k];
			if (poly.shared > 0)
				polys.push(poly);
		}
	}
	console.log("ncut "+ncut);
	return CSG.fromPolygons(polys);
}

let clipPolygons= function(csg,box,print)
{
	if (print) {
		for (let i=0; i<box.polygons.length; i++) {
			let plane= box.polygons[i].plane;
			console.log("plane "+i+" "+plane.normal.x+" "+
			  plane.normal.y+" "+plane.normal.z+" "+plane.w);
		}
	}
	let pout= [];
	for (let i=0; i<csg.polygons.length; i++) {
		let poly= csg.polygons[i];
		if (print) {
			console.log("poly "+i+" "+poly.vertices.length+" "+
			  poly.shared);
			for (let j=0; j<poly.vertices.length; j++) {
				let vert= poly.vertices[j];
				console.log(" "+j+" "+vert.pos.x+" "+
				  vert.pos.y+" "+vert.pos.z);
			}
		}
		for (let j=0; j<box.polygons.length; j++) {
			let plane= box.polygons[j].plane;
			let front= [];
			let back= [];
			plane.splitPolygon(poly,front,back,front,back);
			pout.concat(back);
			if (print)
				console.log(" j "+j+" "+
				  front.length+" "+back.length);
			if (back.length > 0) {
				poly= back[0];
			} else {
				poly= null;
				break;
			}
		}
		if (poly)
			pout.push(poly);
	}
	if (print)
		console.log("pout "+pout.length);
	return CSG.fromPolygons(pout);
}

let overrideSwitchShapes= function()
{
	trackDB.tSection.shapes[38050].filename=
	  trackDB.tSection.shapes[32310].filename;
	trackDB.tSection.shapes[38051].filename=
	  trackDB.tSection.shapes[32311].filename;
	trackDB.tSection.shapes[38052].filename= "SR_1tSwt_w_m06dL.s";
//	trackDB.tSection.shapes[38052].filename= "SR_1tSwt_w_im06dL_NS.s";
//	  trackDB.tSection.shapes[23406].filename;
//	  trackDB.tSection.shapes[32248].filename;
	trackDB.tSection.shapes[38053].filename= "SR_1tSwt_w_m06dR.s";
//	trackDB.tSection.shapes[38053].filename= "SR_1tSwt_w_im06dR_NS.s";
//	  trackDB.tSection.shapes[23407].filename;
//	  trackDB.tSection.shapes[32249].filename;
}

let addModel= function(filename,x,y,z,dx,dy,grade) {
//	console.log(" addmodel "+filename+" "+x+" "+y+" "+z+" "+
//	  dx+" "+dy+" "+grade);
	let static= { filename: filename };
	static.wftx= centerTX + Math.round(x/2048);
	static.wftz= centerTZ + Math.round(y/2048);
	static.x= x - 2048*(static.wftx-centerTX);
	static.y= z;
	static.z= y - 2048*(static.wftz-centerTZ);
	let angle= Math.atan2(dy,dx);
	static.ax= -grade;
	static.ay= Math.PI/2-angle;
	static.az= 0;
	let tile= findTile(static.wftx,static.wftz);
	if (tile) {
		static.wfuid= tile.nextUid++;
		tile.models.push(static);
//		console.log(" tile "+static.wftx+" "+static.wftz);
	}
}

let addBridgeEndModel= function(track,cp,reverse)
{
	if (track.type=="road" || track.type == "dirtroad" ||
	  track.type == "dirtroad1" || cp.bridge=="turntable")
		return;
	let tp= track.trackPoints[cp.trackPoint];
	let dx= cp.direction.x;
	let dy= cp.direction.y;
	let g= cp.cpGrade;
	if (reverse) {
		dx= -dx;
		dy= -dy;
		g= -g;
	}
	addModel("bridgerailend.s",tp.x,tp.y,tp.z,dx,dy,g);
}

let addTrestle= function(track,cp0,cp1)
{
	let pile= cp0.bridge=="ptbd" || cp0.bridge=="pttd";
	let covb= cp0.bridge == "covb";
	let ibeam= cp0.bridge == "ibeam";
	let crbd= cp0.bridge == "crbd";
	let trackPoints= track.trackPoints;
	let len= cp1.distance-cp0.distance;
	let bentSpacing= 16*.3048;
	let deckSpacing= 14*.3048;
	if (covb)
		deckSpacing= 15*.3048;
	if (crbd)
		deckSpacing= 10*.3048;
	if (pile)
		bentSpacing= deckSpacing;
	let nBent= Math.floor(len/bentSpacing);
	let nDeck= Math.ceil(len/deckSpacing);
	if (covb) {
		nDeck= Math.floor(len/deckSpacing);
		nBent= 0;
	}
	if (ibeam || crbd)
		nBent= 0;
	let deck0= (len-deckSpacing*(nDeck-1))/2;
	let bent0= (len-bentSpacing*(nBent-1))/2;
	console.log("trestle "+cp0.bridge+" "+pile+" "+
	  len+" "+nBent+" "+bent0+" "+nDeck+" "+deck0);
	let dist= 0;
	let tp0= trackPoints[cp0.trackPoint];
	let nd= 0;
	let nb= 0;
	for (let k=cp0.trackPoint+1; k<=cp1.trackPoint || nd<nBent+1; k++) {
		let tp1= trackPoints[k];
		let d= tp1.distanceTo(tp0);
//		console.log(" "+k+" "+d+" "+dist+" "+nd+" "+nb);
		while (dist+d >= deck0+nd*deckSpacing) {
			let a= (deck0+nd*deckSpacing-dist)/d;
			let x= (1-a)*tp0.x + a*tp1.x;
			let y= (1-a)*tp0.y + a*tp1.y;
			let z= (1-a)*tp0.z + a*tp1.z;
			let dx= (tp1.x - tp0.x) / d;
			let dy= (tp1.y - tp0.y) / d;
			let dz= (tp1.z - tp0.z) / d;
			let gz= getElevation(x,y);
			let h= 3.281*(z-gz);
			if (covb)
				addModel("covbinside.s",
				  x-dx*deckSpacing/2,
				  y-dy*deckSpacing/2,z,dx,dy,dz);
			else if (crbd)
				addModel("brdeck10ft.s",
				  x-dx*(deckSpacing/2-1.5),
				  y-dy*(deckSpacing/2-1.5),z-.27,dx,dy,dz);
			else
				addModel("DRGW_Panel_5-6pile_14ft.s",
				  x-dx*deckSpacing/2,
				  y-dy*deckSpacing/2,z-.5,dx,dy,dz);
//			console.log(" d "+dx+" "+dy+" "+dz);
//			addModel("String16-TOP-A.s",x,y,z+.15,dx/d,dy/d,dz/d);
//			if (h > 25)
//				addModel("String16-20-A.s",
//				  x,y,z+.15,dx/d,dy/d,dz/d);
//			if (h > 45)
//				addModel("String16-40-A.s",
//				  x,y,z+.15,dx/d,dy/d,dz/d);
			nd++;
		}
		while (nb<nBent && dist+d>=bent0+nb*bentSpacing) {
			let a= (bent0+nb*bentSpacing-dist)/d;
			let x= (1-a)*tp0.x + a*tp1.x;
			let y= (1-a)*tp0.y + a*tp1.y;
			let z= (1-a)*tp0.z + a*tp1.z;
			let dx= tp1.x - tp0.x;
			let dy= tp1.y - tp0.y;
			let dz= tp1.z - tp0.z;
			let gz= getElevation(x,y);
			let h= 3.281*(z-gz);
//			console.log(" h "+h+" "+gz+" "+x+" "+y);
			if (pile) {
				if (h < 22) {
					addModel("DRGW_Bent_5pile_15ft.s",
					  x,y,z-15*.3048-.8,dx/d,dy/d,dz/d);
				} else {
					addModel("DRGW_Bent_5pile_30ft.s",
					  x,y,z-30*.3048-.8,dx/d,dy/d,dz/d);
				}
			} else if (!covb && !crbd) {
				if (h < 10.6) {
					addModel("Bent1-10.s",
					  x,y,z-10*.3048-.6,dx/d,dy/d,dz/d);
					addModel("Foot10-A.s",
					  x,y,gz-.9,dx/d,dy/d,dz/d);
				} else if (h < 20.6) {
					addModel("Bent10-20.s",
					  x,y,z-20*.3048-.6,dx/d,dy/d,dz/d);
					addModel("Foot20-A.s",
					  x,y,gz-.9,dx/d,dy/d,dz/d);
				} else if (h < 30.6) {
					addModel("Bent20-30.s",
					  x,y,z-30*.3048-.6,dx/d,dy/d,dz/d);
					addModel("Foot30-A.s",
					  x,y,gz-.9,dx/d,dy/d,dz/d);
				} else if (h < 40.6) {
					addModel("Bent30-40.s",
					  x,y,z-40*.3048-.6,dx/d,dy/d,dz/d);
					addModel("Foot40-A.s",
					  x,y,gz-.9,dx/d,dy/d,dz/d);
				} else {
					addModel("Bent40-50.s",
					  x,y,z-50*.3048-.6,dx/d,dy/d,dz/d);
					addModel("Foot50-A.s",
					  x,y,gz-.9,dx/d,dy/d,dz/d);
				}
			}
			nb++;
		}
//		if (dist==0 || k==cp1.trackPoint) {
//			let a= dist==0 ? 0 : 1;
//			let x= (1-a)*tp0.x + a*tp1.x;
//			let y= (1-a)*tp0.y + a*tp1.y;
//			let z= (1-a)*tp0.z + a*tp1.z;
//			let dx= tp1.x - tp0.x;
//			let dy= tp1.y - tp0.y;
//			let dz= tp1.z - tp0.z;
//			addModel("Abutment-Wood-A.s",
//			  x,y,z-10*.3048-.6,dx/d,dy/d,dz/d);
//		}
		dist+= d;
		tp0= tp1;
	}
}

//	saves MSTS track data to a new TDB file.
let writePaths= function()
{
	let n= 0;
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		let controlPoints= track.controlPoints;
		for (let j=0; j<controlPoints.length-1; j++) {
			let cp= controlPoints[j];
//			if (cp.bridge && cp.bridge=="covb" &&
//			  cp.model && cp.model.filename) {
			if (cp.name) {
				writePath(n,cp,controlPoints[j+1]);
				n++;
				if (j > 0) {
					writePath(n,cp,controlPoints[j-1]);
					n++;
				}
			}
		}
	}
	console.log("paths "+n);
}

let writePath= function(n,cp0,cp1)
{
	let path= routeDir+fspath.sep+"PATHS"+fspath.sep+"path"+n.toFixed(0)+
	  ".pat";
	const fd= fs.openSync(path,"w");
	const bom= Buffer.alloc(2);
	bom.writeUInt16LE(0xfeff,0);
	fs.writeSync(fd,bom,0,2);
	fs.writeSync(fd,"SIMISA@@@@@@@@@@JINX0P0t______\r\n",null,"utf16le");
	fs.writeSync(fd,"\r\n",null,"utf16le");
	fs.writeSync(fd,"Serial ( 1 )\r\n",null,"utf16le");
	fs.writeSync(fd,"TrackPDPs (\r\n",null,"utf16le");
	let tx= centerTX + Math.round(cp0.position.x/2048);
	let tz= centerTZ + Math.round(cp0.position.y/2048);
	let x= cp0.position.x - 2048*(tx-centerTX);
	let y= cp0.position.z;
	let z= cp0.position.y - 2048*(tz-centerTZ);
	fs.writeSync(fd,"\tTrackPDP ( "+tx+" "+tz+" "+x.toFixed(3)+" "+
	  y.toFixed(3)+" "+z.toFixed(3)+" 1 1 )\r\n",
	  null,"utf16le");
	tx= centerTX + Math.round(cp1.position.x/2048);
	tz= centerTZ + Math.round(cp1.position.y/2048);
	x= cp1.position.x - 2048*(tx-centerTX);
	y= cp1.position.z;
	z= cp1.position.y - 2048*(tz-centerTZ);
	fs.writeSync(fd,"\tTrackPDP ( "+tx+" "+tz+" "+x.toFixed(3)+" "+
	  y.toFixed(3)+" "+z.toFixed(3)+" 1 1 )\r\n",
	  null,"utf16le");
	fs.writeSync(fd,")\r\n",null,"utf16le");
	fs.writeSync(fd,"TrackPath (\r\n",null,"utf16le");
	fs.writeSync(fd,"\tTrPathName ( "+n+" )\r\n",null,"utf16le");
	fs.writeSync(fd,"\tName ( path"+n+" )\r\n",null,"utf16le");
//	fs.writeSync(fd,"\tTrPathStart ( "+cp0.model.filename+
	fs.writeSync(fd,"\tTrPathStart ( \""+cp0.name+
	  "\" )\r\n",null,"utf16le");
	fs.writeSync(fd,"\tTrPathEnd ( "+
	  (cp0.position.x>cp1.position.x?"west":"east")+
	  " )\r\n",null,"utf16le");
	fs.writeSync(fd,"\tTrPathNodes ( 2\r\n",null,"utf16le");
	fs.writeSync(fd,"\t\tTrPathNode ( 00000000 1 4294967295 0 )\r\n",
	  null,"utf16le");
	fs.writeSync(fd,
	  "\t\tTrPathNode ( 00000000 4294967295 4294967295 1 )\r\n",
	  null,"utf16le");
	fs.writeSync(fd,"\t)\r\n",null,"utf16le");
	fs.writeSync(fd,")\r\n",null,"utf16le");
	fs.closeSync(fd);
}

let getWaterInfo= function(tile)
{
//	return null;
	let x0= 2048*(tile.x-centerTX);
	let z0= 2048*(tile.z-centerTZ);
	let points= [];
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track.type != "water")
			continue;
		let controlPoints= track.controlPoints;
		for (let j=0; j<controlPoints.length; j++) {
			let cp= controlPoints[j];
			if (cp.position.x<x0-1024 ||
			  cp.position.x>x0+1024 ||
			  cp.position.y<z0-1024 ||
			  cp.position.y>z0+1024)
				continue;
			points.push([cp.position.x-x0,cp.position.y-z0,
			  cp.position.z]);
		}
	}
	if (points.length < 3)
		return null;
	let flags= [];
	for (let i=0; i<256; i++)
		flags.push(0);
	let setFlag= function(pi,pj) {
		if (0<=pi && pi<=15 && 0<=pj && pj<=15)
			flags[pi*16+pj]= 0xc0;
	}
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track.type != "water")
			continue;
		let trackPoints= track.trackPoints;
		for (let j=0; j<trackPoints.length; j++) {
			let tp= trackPoints[j];
			if (tp.x<x0-1024 || tp.x>x0+1024 ||
			  tp.y<z0-1024 || tp.y>z0+1024)
				continue;
			let pi= Math.floor((1024-tp.y+z0)/128);
			let pj= Math.floor((tp.x+1024-x0)/128);
			setFlag(pi,pj);
			setFlag(pi+1,pj+1);
			setFlag(pi+1,pj-1);
			setFlag(pi-1,pj+1);
			setFlag(pi-1,pj-1);
//			console.log(" water patch "+pi+" "+pj+" "+flags[pi*16+pj]);
		}
	}
	let sum1= [0,0,0];
	let sum2= [0,0,0];
	let sum3= [0,0,0];
	for (let i=0; i<points.length; i++) {
		let p= points[i];
		for (let j=0; j<3; j++) {
			sum1[j]+= p[j];
			sum2[j]+= p[j]*p[j];
			sum3[j]+= p[j]*p[(j+1)%3];
		}
	}
	let dx= points.length*sum2[0] - sum1[0]*sum1[0];
	let dy= points.length*sum2[1] - sum1[1]*sum1[1];
	let ax= (sum2[0]*sum1[2] - sum1[0]*sum3[2]) / dx;
	let ay= (sum2[1]*sum1[2] - sum1[1]*sum3[1]) / dy;
	let bx= (points.length*sum3[2] - sum1[0]*sum1[2]) / dx;
	let by= (points.length*sum3[1] - sum1[1]*sum1[2]) / dy;
	console.log("x "+dx+" "+ax+" "+bx);
	console.log("y "+dy+" "+ay+" "+by);
	let sw= .5*(ax+ay) - 1024*bx - 1024*by;
	let se= .5*(ax+ay) + 1024*bx - 1024*by;
	let nw= .5*(ax+ay) - 1024*bx + 1024*by;
	let ne= .5*(ax+ay) + 1024*bx + 1024*by;
	console.log("sw "+sw+" se "+se+" nw "+nw+" ne "+ne);
	let m= new THREE.Matrix3();
	m.set(sum2[0],sum3[0],sum1[0],
	  sum3[0],sum2[1],sum1[1],
	  sum1[0],sum1[1],points.length);
	let mi= new THREE.Matrix3();
	mi.getInverse(m);
	let v= new THREE.Vector3(sum3[2],sum3[1],sum1[2]);
	v.applyMatrix3(mi);
	console.log("v "+v.x+" "+v.y+" "+v.z);
//	sw= v[2] - 1024*v[0] - 1024*v[1];
//	se= v[2] + 1024*v[0] - 1024*v[1];
//	nw= v[2] - 1024*v[0] + 1024*v[1];
//	ne= v[2] + 1024*v[0] + 1024*v[1];
	sw= v.z - 1024*v.x - 1024*v.y;
	se= v.z + 1024*v.x - 1024*v.y;
	nw= v.z - 1024*v.x + 1024*v.y;
	ne= v.z + 1024*v.x + 1024*v.y;
	console.log("sw "+sw+" se "+se+" nw "+nw+" ne "+ne);
	let water= {
		sw: sw, se: se, ne: ne, nw: nw,
		patchFlags: flags
	};
	return water;
}

let terrainCoords= function(u,v)
{
	let tx= centerTX + Math.round(u/2048);
	let tz= centerTZ + Math.round(v/2048);
	let x= u - 2048*(tx-centerTX);
	let z= v - 2048*(tz-centerTZ);
	let tj= Math.floor(x/8) + 128;
	let ti= 128 - Math.floor(z/8);
	if (tj < 0) {
		tj+= 256;
		tx-= 1;
	}
	if (ti <= 0) {
		ti+= 256;
		tz+= 1;
	}
	return { tx:tx, tz:tz, i:ti, j:tj };
}

let setContourElevation= function()
{
	console.log("setcontour "+centerU+" "+centerV);
	let smooth= function(p) {
		let sum= 0;
		for (let di=-1; di<=1; di++) {
			for (let dj=-1; dj<=1; dj++) {
				sum+= getTerrainElevation(
				  p.i+di,p.j+dj,p.tile,true);
			}
		}
		sum/= 9;
		if (sum < p.maxZ)
			setTerrainElevation(p.i,p.j,p.tile,sum,true);
//		else
//			console.log("zlimit "+sum+" "+p.z+" "+p.maxZ+" "+
//			  p.i+" "+p.j);
	}
	for (let i=0; i<tracks.length; i++) {
		let track= tracks[i];
		if (track.type != "contour")
			continue;
		let controlPoints= track.controlPoints;
		let minX= 1e10;
		let maxX= -1e10;
		let minY= 1e10;
		let maxY= -1e10;
		for (let j=0; j<controlPoints.length; j++) {
			let cp= controlPoints[j];
			console.log("cp "+j+" "+cp.position.x+" "+
			  cp.position.y);
			if (minX > cp.position.x)
				minX= cp.position.x;
			if (maxX < cp.position.x)
				maxX= cp.position.x;
			if (minY > cp.position.y)
				minY= cp.position.y;
			if (maxY < cp.position.y)
				maxY= cp.position.y;
		}
		console.log("contour "+minX+" "+maxX+" "+minY+" "+maxY);
		let points= [];
		for (let x=8*Math.ceil(minX/8); x<maxX; x+=8) {
			let min= 1e10;
			let max= -1e10;
			let minZ= 1e10;
			let maxZ= -1e10;
			let cp0= controlPoints[0];
			for (let j=1; j<controlPoints.length; j++) {
				let cp1= controlPoints[j];
				let pi= segSegInt(cp0.position,cp1.position,
				  {x:x,y:minY},{x:x,y:maxY});
				if (pi.d==0 || pi.s<0 || pi.s>1 ||
				  pi.t<0 || pi.t>1) {
					cp0= cp1;
					continue;
				}
				console.log(" pi "+j+" "+x+" "+
				  pi.x+" "+pi.y+" "+pi.s);
				if (min > pi.y) {
					min= pi.y;
					minZ= cp0.position.z +
					  pi.s*(cp1.position.z-cp0.position.z);
				}
				if (max < pi.y) {
					max= pi.y;
					maxZ= cp0.position.z +
					  pi.s*(cp1.position.z-cp0.position.z);
				}
				cp0= cp1;
			}
			console.log(" x "+x+" "+min+" "+max+" "+minZ+" "+maxZ+
			  " "+(8*Math.ceil(min/8)));
			for (let y=8*Math.ceil(min/8); y<max; y+=8) {
				let z= minZ + (maxZ-minZ)*(y-min)/(max-min);
				let tc= terrainCoords(x,y);
				let tile= findTile(tc.tx,tc.tz);
				if (tile) {
					let e= getTerrainElevation(
					  tc.i,tc.j,tile,true);
					console.log("  y "+y+" "+e+" "+z);
					if (e < z)
						z= e;
					let maxZ= getTerrainElevation(
					  tc.i,tc.j,tile,false);
					if (maxZ < z)
						z= maxZ;
					setTerrainElevation(tc.i,tc.j,
					  tile,z,true);
					points.push({ x:x, y:y, z:z, maxZ:maxZ,
					 tile:tile, i:tc.i, j:tc.j, adjy:0 });
				}
			}
		}
		for (let j=0; j<points.length; j++) {
			let pj= points[j];
			for (let k=j+1; k<points.length; k++) {
				let pk= points[k];
				if (pk.y > pj.y+8)
					break;
				if (pk.x==pj.x && pk.y==pj.y+8) {
					pk.adjy+= 1;
					pj.adjy+= 2;
					break;
				}
			}
		}
		let edge= [];
		for (let j=0; j<points.length; j++) {
			let p= points[j];
			if (j==0 || j==points.length-1 || p.adjy!=3 ||
			  points[j-1].x!=p.x || points[j+1].x!=p.x)
				edge.push(p);
		}
		console.log("np "+points.length+" "+edge.length);
		for (let j=0; j<edge.length; j++) {
			console.log("edge "+j+" "+edge[j].x+" "+edge[j].y+" "+
			  edge[j].adjy);
		}
		for (let pass=0; pass<10; pass++) {
			for (let j=0; j<edge.length; j++)
				smooth(edge[j]);
			for (let j=0; j<points.length; j++)
				smooth(points[j]);
		}
	}
}

let saveBridgeTrackShape= function(dp)
{
	let curve= dp.curve;
	let filename= ((dp.bridge=="ptbd" || dp.bridge=="tdbd") ?
	  "brdgtrackbd" : "brdgtracktd") + curve.shapeID.toFixed(0);
	let moves= [];
	if (curve.len1 > .01) {
		moves.push([curve.len1,0]);
	}
	if (curve.radius > 10) {
		moves.push([curve.radius,curve.angle*180/Math.PI]);
	}
	if (curve.len2 > .01) {
		moves.push([curve.len2,0]);
	}
	let data= { 
	  filename: filename+".s",
	  paths: [ { start: [0,0,0], angle: 0, moves: moves } ]
	};
	let s= JSON.stringify(data,null,1);
	let path= routeDir+fspath.sep+"SHAPES"+fspath.sep+filename+".json";
	fs.writeFileSync(path,s);
}
