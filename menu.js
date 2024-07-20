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

//	Menu setup code for Dynamic Track Editor

//	adds menu to main window
let setupMenu= function() {
	var topMenu= new nw.Menu({type: 'menubar'});
	var fileMenu= new nw.Menu();
	if (!trackDB && !projection) {
		fileMenu.append(new nw.MenuItem({
			label: 'Open',
			click: function() {
				document.getElementById('fileopen').click();
			}
		}));
		fileMenu.append(new nw.MenuItem({
			label: 'Open TDB',
			click: function() {
				document.getElementById('fileopentdb').click();
			}
		}));
	} else {
		fileMenu.append(new nw.MenuItem({
			label: 'Save',
			click: function() {
				let e= document.getElementById('filesave');
				e.value= "";
				e.click();
			}
		}));
	}
	fileMenu.append(new nw.MenuItem({
		label: 'Import CSV',
		click: function() {
			document.getElementById('fileimport').click();
		}
	}));
	if (tracks.length > 0) {
		fileMenu.append(new nw.MenuItem({
			label: 'Export CSV',
			click: function() {
				document.getElementById('fileexport').click();
			}
		}));
	}
	if (trackDB && !addToTrackDB) {
		fileMenu.append(new nw.MenuItem({
			label: 'Save to Route',
			click: saveToRoute
		}));
		fileMenu.append(new nw.MenuItem({
			label: 'Add Tiles',
			click: addTiles
		}));
		fileMenu.append(new nw.MenuItem({
			label: 'Save Tile Image',
			click: saveTileImage
		}));
	}
	fileMenu.append(new nw.MenuItem({
		label: 'Save Tile Cut&Fill',
		click: saveTileCutFill
	}));
//	fileMenu.append(new nw.MenuItem({
//		label: 'Save Elevated Track',
//		click: saveElevatedTracks
//	}));
//	fileMenu.append(new nw.MenuItem({
//		label: 'Find Features',
//		click: findTopoFeatures
//	}));
//	fileMenu.append(new nw.MenuItem({
//		label: 'Make Quad Tree',
//		click: makeQuadTree
//	}));
	topMenu.append(new nw.MenuItem({
		label: 'File',
		submenu: fileMenu
	}));
	var editMenu= new nw.Menu();
	editMenu.append(new nw.MenuItem({
		label: 'Delete',
		click: deleteControlPoint
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Straight',
		click: makeStraight
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Curve',
		click: makeCurve
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Align',
		click: alignStraight
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Equalize Radius',
		click: equalizeCurveRadius
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Offset',
		click: moveAway
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Calc.Elev.',
		click: setCalcElev
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Bridge',
		click: toggleBridge
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Overpass',
		click: toggleOverpass
	}));
	editMenu.append(new nw.MenuItem({
		label: 'No Cut',
		click: toggleNoCut
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Group',
		click: selectGroup
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Change Switch Type',
		click: changeSwitchType
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Switch Stand',
		click: toggleSwitchStand
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Change Track Type',
		click: changeTrackType
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Change Track Name',
		click: changeTrackName
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Set Length',
		click: setLength
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Level Crossing',
		click: setCrossingLevel
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Cut',
		click: cutTerrain
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Fill&Cut',
		click: fillTerrain
	}));
//	editMenu.append(new nw.MenuItem({
//		label: 'Simplify Track',
//		click: simplify
//	}));
	editMenu.append(new nw.MenuItem({
		label: 'Attach Model',
		click: attachModel
	}));
	editMenu.append(new nw.MenuItem({
		label: 'Attach Forest',
		click: attachForest
	}));
	topMenu.append(new nw.MenuItem({
		label: 'Edit',
		submenu: editMenu
	}));
	var mapMenu= new nw.Menu();
	mapMenu.append(new nw.MenuItem({
		label: 'USGS Topo',
		click: function() {
		  mapType= "topo"; backgroundTiles=[]; renderCanvas();
		}
	}));
	mapMenu.append(new nw.MenuItem({
		label: 'USGS Imagery',
		click: function() {
			mapType= "imagery"; backgroundTiles=[]; renderCanvas();
		}
	}));
	mapMenu.append(new nw.MenuItem({
		label: 'USGS ImageryTopo',
		click: function() {
			mapType= "imagerytopo";
			backgroundTiles=[];
			renderCanvas();
		}
	}));
	mapMenu.append(new nw.MenuItem({
		label: 'USGS Hydro',
		click: function() {
			mapType= "hydro"; backgroundTiles=[]; renderCanvas();
		}
	}));
	mapMenu.append(new nw.MenuItem({
		label: 'Open Street Map',
		click: function() {
			mapType= "osm"; backgroundTiles=[]; renderCanvas();
		}
	}));
	mapMenu.append(new nw.MenuItem({
		label: 'Route',
		click: function() {
			mapType= "route"; backgroundTiles=[]; renderCanvas();
		}
	}));
	mapMenu.append(new nw.MenuItem({
		label: 'OSG Earth',
		click: function() {
			mapType= "osge"; backgroundTiles=[]; renderCanvas();
		}
	}));
	mapMenu.append(new nw.MenuItem({
		label: 'OSG Earth/USGS Hydro',
		click: function() {
			mapType= "osgehydro";
			backgroundTiles=[]; renderCanvas();
		}
	}));
	mapMenu.append(new nw.MenuItem({
		label: 'USGS Imagery/Hydro',
		click: function() {
			mapType= "imageryhydro";
			backgroundTiles=[]; renderCanvas();
		}
	}));
	mapMenu.append(new nw.MenuItem({
		label: 'Save Water',
		click: saveWater
	}));
	mapMenu.append(new nw.MenuItem({
		label: 'Save Image',
		click: saveImage
	}));
	mapMenu.append(new nw.MenuItem({
		label: 'Save Tile Colors',
		click: saveTileColors
	}));
	topMenu.append(new nw.MenuItem({
		label: 'Map',
		submenu: mapMenu
	}));
	nw.Window.get().menu= topMenu;
}

let setupFileDialogs= function()
{
	document.getElementById('fileopentdb').addEventListener('change',
		function(e) {
//			console.log('open '+this.value);
			trackDB= readTrackDB(this.value);
			if (trackDB.nodes.length > 0)
				addToTrackDB= true;
			readTiles();
			findCenter();
			readProjection();
			calcTrackDBUV();
			convertTrackDB();
			renderCanvas();
			setupMenu();
		});
	document.getElementById('fileopen').addEventListener('change',
		function(e) {
//			console.log('open '+this.value);
			readData(this.value);
			setupMenu();
		});
	document.getElementById('filesave').addEventListener('change',
		function(e) {
			console.log('save '+this.value);
			saveData(this.value);
		});
	document.getElementById('fileimport').addEventListener('change',
		function(e) {
			readCSV(this.value);
//			renderCanvas();
			setupMenu();
		});
	document.getElementById('fileexport').addEventListener('change',
		function(e) {
			writeCSV(this.value);
//			renderCanvas();
		});
}
