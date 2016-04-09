var dbg = require('debug')('luma:terrain');

var Terrain = {

    heightmapPath: "./assets/img/bump.jpg",
    texturePath: "./assets/img/topography.jpg",
    color: 0x006994,

    width: 1024,
    height: 1024,
    quality: 0.25,
    softness: 10,

    loadAssets: function(successCb, progressCb) {
        dbg('Load terrain assets');
        var self = this;

        var iLoader = new THREE.ImageLoader();
        var tLoader = new THREE.TextureLoader();

        iLoader.load(Terrain.heightmapPath, function(img) {
            self.heightmap = img;
            tLoader.load(Terrain.texturePath, function(texture) {
                self.texture = texture;
                self.assetsLoaded(successCb);
            }, function(event){
                self.assetsLoading(event, progressCb, "Texture")
            }, function() {
                dbg('Error: load terrain texture');
            });
        }, function(event){
            self.assetsLoading(event, progressCb, "Heightmap")
        }, function() {
            dbg('Error: load terrain heightmap');
        });
    },

    assetsLoaded: function(cb) {
        dbg('terrain assets loaded');
        cb();
    },

    assetsLoading: function(event, progressCb, key) {
        progressCb({
            key: 'terrain' + key,
            value: event.loaded / event.total
        })
    },

    create: function(scene) {
        dbg('create terrain');

        this.scene = scene;

        this.imgc = document.createElement("canvas");
        this.ictx = this.imgc.getContext("2d");

        var cvs = document.createElement("canvas");
        var ctx = cvs.getContext("2d");

        cvs.width = this.heightmap.width;
        cvs.height = this.heightmap.height;
        ctx.drawImage(this.heightmap, 0, 0, this.heightmap.width, this.heightmap.height);

        if (Terrain.quality > 1) Terrain.quality = 1;
        if (Terrain.quality < 0.01) Terrain.quality = 0.01;

        this.imgc.width = Terrain.width * Terrain.quality;
        this.imgc.height = Terrain.height * Terrain.quality;
        this.ictx.drawImage(cvs, 0, 0, cvs.width, cvs.height, 0, 0, this.imgc.width, this.imgc.height);

        this.data = this.imageDataMinMax(this.blur(Terrain.softness)).data;

        this.texture.mapping = THREE.SphericalReflectionMapping;
        this.texture.wrapS = THREE.RepeatWrapping;
        this.texture.wrapT = THREE.RepeatWrapping;
        this.texture.repeat.set(8, 8);

        this.matrix = TerrainMatrix.create(this.data, 3, 3);
        
        this.meshs = this.matrix.meshs;
        this.currentTile = this.matrix.currentTile;

        return this;
    },
    
    setCurrentTile: function(tile) {
        this.matrix.setCurrentTile(tile);
    },

    imageDataMinMax: function(image) {
        var m = this.imgc.width;
        var n = this.imgc.height;

        // find range
        var minimum = Infinity;
        var maximum = 0;
        var first = true;
        var d = 0;
        var i;

        for (i = 0; i < n * m; i++) {
            try {d = image[i]}
            catch(e) {console.log(e); console.log("i: "+i); console.log("image: "+image); break}

            minimum = Math.min(minimum, d);
            maximum = Math.max(maximum, d);

            if (i == m*n-1) first = false;
        }

        var finalImage = this.ictx.createImageData(m, n);
        var data = finalImage.data;   // pixel data array of (width*height*4) elements
        var ceil = 255;
        var floor = 0;

        var newmin = Infinity;
        var newmax = 0;

        // Convert to visible
        for (i = 0; i < n * m; i++) {
            d = image[i];
            normd = ((ceil - floor) * (d - minimum))/(maximum - minimum) + floor;
            newmin = Math.min(newmin, normd);
            newmax = Math.max(newmax, normd);
            data[i*4]   = normd; //r
            data[i*4+1] = normd; //g
            data[i*4+2] = normd; //b
            data[i*4+3] = 255;   //a
        }

        this.ictx.putImageData(finalImage, 0, 0);

        return finalImage;
    },

    blur: function(radius) {
        var imageData = this.imageData();

        if (isNaN(radius) || radius < 1) return this.image(imageData);
        radius |= 0;

        return this.image(StackBlur.imageDataRGB(imageData, 0, 0, this.imgc.width, this.imgc.height, radius));
    },

    imageData: function() {
        var data;

        try {
            data = this.ictx.getImageData(0, 0, this.imgc.width, this.imgc.height);
        } catch(e) {
            throw new Error("unable to access local image data: " + e);
        }

        return data;
    },

    image: function(imageData) {
        var data = imageData.data;
        var image = new Array(this.imgc.width * this.imgc.height);

        for (var i = 0; i < this.imgc.height * this.imgc.width; i++) {
            image[i] = data[i*4];
        }

        return image;
    }
    
};

var TerrainMatrix = {

    matrix: null,
    meshs: [],

    current: null,

    create: function(data, xSize, zSize) {
        dbg('create matrix');
        if (xSize % 2 == 0) xSize++;
        if (zSize % 2 == 0) zSize++;

        this.xMax = (xSize + 1) / 2 - 1;
        this.xMin = -this.xMax;

        this.zMax = (zSize + 1) / 2 - 1;
        this.zMin = -this.zMax;

        this.matrix = {};

        var x, z;
        for (x = this.xMin; x <= this.xMax; x++) {
            this.matrix[x] = {};

            for (z = this.zMin; z <= this.zMax; z++) {
                this.matrix[x][z] = new TerrainTile(data, {x: x, z: z});
                this.meshs.push(this.matrix[x][z].mesh);
            }
        }

        this.currentTile = this.matrix[0][0];

        return this;
    },

    setCurrentTile: function(tile) {
        dbg('set matrix current tile');
        var x, z, min, max;

        // x
        if (tile.position.x < this.currentTile.position.x) {
            min = this.xMin - 1;

            this.matrix[min] = {};
            for (z = this.zMin; z <= this.zMax; z++) {
                this.matrix[min][z] = this.matrix[this.xMax][z];
                this.matrix[min][z].position.set(min, z);
            }

            delete this.matrix[this.xMax];
            this.xMin = min;
            this.xMax--;

        } else if (tile.position.x > this.currentTile.position.x) {
            max = this.xMax + 1;

            this.matrix[max] = {};
            for (z = this.zMin; z <= this.zMax; z++) {
                this.matrix[max][z] = this.matrix[this.xMin][z];
                this.matrix[max][z].position.set(max, z);
            }

            delete this.matrix[this.xMin];
            this.xMax = max;
            this.xMin++;
        }

        // z
        if (tile.position.z < this.currentTile.position.z) {
            min = this.zMin - 1;

            for (x = this.xMin; x <= this.xMax; x++) {
                this.matrix[x][min] = this.matrix[x][this.zMax];
                this.matrix[x][min].position.set(x, min);
                delete this.matrix[x][this.zMax];
            }

            this.zMin = min;
            this.zMax--;

        } else if (tile.position.z > this.currentTile.position.z) {
            max = this.zMax - 1;

            for (x = this.xMin; x <= this.xMax; x++) {
                this.matrix[x][max] = this.matrix[x][this.zMin];
                this.matrix[x][max].position.set(x, max);
                delete this.matrix[x][this.zMin];
            }

            this.zMax = max;
            this.zMin--;
        }

        this.currentTile = tile;
    }

};

var TerrainTile = function(data, position) {
    dbg('create tile');
    var self = this;

    this.width = Terrain.width;
    this.height = Terrain.height;

    if (!TerrainTile.base) {
        this.createMesh(
            this.createGeometry(data),
            this.createMaterial()
        );
        TerrainTile.base = this;
        return new TerrainTile(data, position);
    } else {
        this.copy(TerrainTile.base);
    }

    this.position = {
        x: null,
        z: null,

        set: function(x, z) {
            this.x = x;
            this.z = z;

            self.mesh.position.setX(this.x * self.width);
            self.mesh.position.setZ(this.z * self.height);
        }
    };

    if (position) this.position.set(position.x, position.z);

    this.mesh.terrainTile = this;

    Terrain.scene.add(this.mesh);

    return this;
};
TerrainTile.prototype.constructor = TerrainTile;

TerrainTile.base = null;

TerrainTile.prototype.createMesh = function(geometry, material) {
    dbg('create tile Mesh');
    this.mesh = new THREE.Mesh(geometry, material);

    return this.mesh;
};

TerrainTile.prototype.createGeometry = function(data) {
    dbg('create tile Geometry');
    this.geometry = new THREE.PlaneBufferGeometry(this.width, this.height, Terrain.imgc.width - 1, Terrain.imgc.height - 1);
    this.geometry.rotateX(- Math.PI / 2);

    for (var i = 0, j = 0, l = this.geometry.attributes.position.array.length - 1; i < l; i += 3, j += 4) {
        this.geometry.attributes.position.array[i + 1] = data[j];
    }

    return this.geometry;
};

TerrainTile.prototype.createMaterial = function() {
    dbg('create tile Material');
    this.material = new THREE.MeshPhongMaterial({
        color: Terrain.color,
        shininess: 0,
        map: Terrain.texture
    });

    return this.material;
};

TerrainTile.prototype.copy = function(origin) {
    dbg('copy tile');
    this.mesh = origin.mesh.clone();
    this.geometry = origin.geometry.clone();
    this.material = origin.material.clone();
};

module.exports = Terrain;
