let THREE = require("three"); // To silence the warning

// IMPORTS:
const config = require("../config.js");
const geos = require("../libs/geos.js");

// LOAD OBJ:
let textureLoader = new THREE.TextureLoader();
function loadObj(parent, src, textureSrc, scale) {
    return new Promise(resolve => {
        let loader = new THREE.OBJLoader();
        loader.load(src, model => {
                let texture;
                if (textureSrc) {
                    texture = textureLoader.load(textureSrc, texture => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        texture.repeat.set(1, 1);
                        texture.minFilter = THREE.NearestFilter;
                        texture.magFilter = THREE.NearestFilter;
                        texture.needsUpdate = true;
                    });
                }
                let material = new THREE.MeshLambertMaterial({
                    map: texture
                });
                let tmpGeometry = new THREE.Geometry();
                model.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        if (child.geometry.isBufferGeometry) {
                            tmpGeometry.fromBufferGeometry(child.geometry);
                            tmpGeometry.computeFlatVertexNormals();
                            child.geometry.fromGeometry(tmpGeometry);
                        } else {
                            child.geometry.computeFlatVertexNormals();
                        }
                        child.material = material;
                    }
                });
                model.scale.setScalar(scale||1);
                parent.add(model);
                resolve();
            }
        );
    });
}

// GENERATE MESH:
const cubeGeometry = new THREE.BoxBufferGeometry(1, 1, 1);
const planeGeometry = new THREE.PlaneBufferGeometry(1, 1); planeGeometry.rotateX(-Math.PI / 2);
const ladderMaterial = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
const cubeMaterial = new THREE.MeshLambertMaterial({ color: 0x555555 });
async function generateMesh(parent, geometry, material) {
    let mesh = new THREE.Mesh(geometry, material);
    parent.add(mesh);
}

// GENERATE SPRITE:
function generateSprite(parent, src, scale) {
    let spriteMap = new THREE.TextureLoader().load(src);
    spriteMap.magFilter = THREE.NearestFilter;
    let spriteMaterial = new THREE.SpriteMaterial( { map: spriteMap, color: 0xffffff } );
    let sprite = new THREE.Sprite(spriteMaterial);
    if (scale) {
        sprite.scale.set(scale, scale, 1);
    }
    parent.add(sprite);
}

// GENERATE PLANE:
function generatePlane(w, l) {
    let geo = new THREE.PlaneGeometry(w, l);
    geo.rotateX(-Math.PI / 2);
    return geo;
}

// GENERATE CUBE:
function generateCube(x, y, z, amb) {
    var tmpGeo = geos.generateCube([1,1,1,1,1,1], x, y, z, {
        scale: 1,
        amb: amb,
        useScale: true
    });
    tmpGeo = new THREE.BufferGeometry().fromGeometry(tmpGeo);
    return tmpGeo;
}

// GENERATE RAMP:
function generateRamp(x, y, z) {
    let w = x / 2;
    let l = z / 2;
    let h = y / 2;
    let geometry = new THREE.BufferGeometry();
    let vertices = new Float32Array([
        -w, -h, -l,
        -w, -h,  l,
        w, h,  l,
        w, h,  l,
        w, h, -l,
        -w, -h, -l,
    ]);
    w = Math.sqrt(Math.pow(w, 2) + Math.pow(h, 2));
    let uv = new Float32Array([
        -w, -l,
        -w,  l,
        w,  l,
        w,  l,
        w, -l,
        -w, -l,
    ]);
    let xn = -h;
    let yn = l;
    let normal = new Float32Array([
        xn, yn, 0,
        xn, yn, 0,
        xn, yn, 0,
        xn, yn, 0,
        xn, yn, 0,
        xn, yn, 0
    ]);
    geometry.addAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.addAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.addAttribute("normal", new THREE.BufferAttribute(normal, 3));
    return geometry;
}

// PREFABS:
module.exports.prefabs = {
    CRATE: {
        dontRound: true,
        gen: parent => loadObj(parent, "models/crate_0.obj", "textures/crate_0.png", config.crateScale),
        dummy: false,
        castShadow: true,
        receiveShadow: true
    },
    STACK: {
        dontRound: true,
        gen: parent => loadObj(parent, "models/stack_0.obj", "textures/stack_0.png", config.crateScale),
        dummy: false,
        castShadow: true,
        receiveShadow: true
    },
    BARREL: {
        dontRound: true,
        complex: true,
        gen: parent => loadObj(parent, "models/barrel_0.obj", "textures/barrel_0.png", config.barrelScale),
        castShadow: true,
        receiveShadow: true
    },
    VEHICLE: {
        dontRound: true,
        complex: true,
        gen: parent => loadObj(parent, "models/vehicle_0.obj", "textures/vehicle_0.png", config.vehicleScale),
        castShadow: true,
        receiveShadow: true
    },
    LADDER: {
        defaultSize: [2, 10, 4],
        scalable: true,
        scaleWithSize: false,
        hideBoundingBox: false,
        texturable: false,
        genGeo: async size => generateCube(...size),
        customDirection: true,
        stepSrc: "a",
        dummy: false,
        castShadow: true,
        receiveShadow: true
    },
    CUBE: {
        defaultSize: [10, 10, 10],
        scalable: true,
        editAmb: true,
        scaleWithSize: false,
        editColor: true,
        editEmissive: true,
        editOpac: true,
        hideBoundingBox: false,
        editPen: true,
        texturable: true,
        genGeo: async (size, amb) => generateCube(...size, amb),
        stepSrc: "a",
        dummy: false,
        castShadow: true,
        receiveShadow: true
    },
    RAMP: {
        defaultSize: [10, 5, 10],
        scalable: true,
        scaleWithSize: false,
        hideBoundingBox: false,
        boostable: true,
        editColor: true,
        texturable: true,
        genGeo: async size => generateCube(...size),
        shootable: true,
        customDirection: true,
        stepSrc: "a",
        dummy: false,
        castShadow: true,
        receiveShadow: true
    },
    PLANE: {
        defaultSize: [4, 0.01, 4],
        dontRound: true,
        scalable: true,
        canTerrain: true,
        scaleWithSize: true,
        editColor: true,
        editPen: true,
        editEmissive: true,
        editOpac: true,
        hideBoundingBox: false,
        texturable: true,
        genGeo: async size => generatePlane(size[0], size[2]),
        stepSrc: "a",
        dummy: false,
        castShadow: true,
        receiveShadow: true
    },
    OBJECTIVE: {
        defaultSize: [50, 50, 50],
        scalable: true,
        noTexture: true,
        opacity: 0.2,
        lineCol: 0xC800FF,
        tool: true,
        genGeo: async (size, amb) => generateCube(...size, amb),
        stepSrc: "a"
    },
    PARTICLES: {
        defaultSize: [20, 20, 20],
        hasParticles: true,
        scalable: true,
        noTexture: true,
        opacity: 0.3,
        lineCol: 0x2EFFFF,
        tool: true,
        genGeo: async (size, amb) => generateCube(...size, amb),
        stepSrc: "a"
    },
    BILLBOARD: {
        defaultSize: [40, 0.01, 10],
        lineCol: 0xffff00,
        dontRound: true,
        scalable: true,
        canTerrain: true,
        scaleWithSize: true,
        hideBoundingBox: false,
        genGeo: async size => generatePlane(size[0], size[2]),
        stepSrc: "a",
        dummy: false,
        castShadow: true,
        receiveShadow: true
    },
    SCORE_ZONE: {
        defaultSize: [10, 10, 10],
        scalable: true,
        noTexture: true,
        opacity: 0.3,
        lineCol: 0xffff00,
        tool: true,
        genGeo: async (size, amb) => generateCube(...size, amb),
        stepSrc: "a"
    },
    DEATH_ZONE: {
        defaultSize: [10, 10, 10],
        scalable: true,
        noTexture: true,
        opacity: 0.3,
        lineCol: 0xff0000,
        tool: true,
        genGeo: async (size, amb) => generateCube(...size, amb),
        stepSrc: "a"
    },
    SPAWN_POINT: {
        defaultSize: [8, 8, 8],
        scalable: false,
        alwaysSee: true,
        tool: true,
        scaleWithSize: false,
        teamable: true,
        hideBoundingBox: true,
        editorGen: parent => generateSprite(parent, "img/favicon.png", 8),
        stepSrc: "a",
        dummy: false,
        castShadow: false,
        receiveShadow: false
    },
    CAMERA_POSITION: {
        defaultSize: [2, 2, 2],
        scalable: false,
        alwaysSee: true,
        tool: true,
        scaleWithSize: false,
        hideBoundingBox: true,
        editorGen: parent => generateSprite(parent, "img/crosshair.png", 5),
        stepSrc: "a",
        dummy: false,
        castShadow: false,
        receiveShadow: false
    },
};

// TEXTURE PREFABS:
module.exports.texturePrefabs = {
    WALL: {
        src: "wall_0",
        filter: THREE.NearestFilter
    },
    DIRT: {
        src: "dirt_0",
        filter: THREE.NearestFilter
    },
    FLOOR: {
        src: "floor_0",
        filter: THREE.NearestFilter
    },
    GRID: {
        src: "grid_0",
        filter: THREE.NearestFilter
    },
    GREY: {
        src: "grey_0",
        filter: THREE.NearestFilter
    },
    DEFAULT: {
        src: "default",
        filter: THREE.NearestFilter
    },
    ROOF: {
        src: "roof_0",
        filter: THREE.NearestFilter
    },
    FLAG: {
        src: "flag_0",
        filter: THREE.NearestFilter
    }
};

// LOAD TEXTURE:
module.exports.loadTexturePrefab = function(id) {
    let prefab = module.exports.texturePrefabs[id];
    if (prefab.src == "default") return;
    return textureLoader.load("/textures/" + prefab.src + ".png", texture => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = prefab.filter;
        texture.magFilter = prefab.filter;
        texture.needsUpdate = true;
    });
};
