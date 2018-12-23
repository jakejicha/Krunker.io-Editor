
// DISABLE ERRORS:
console.warn = (text) => {};
console.info = (text) => {};

// PREVENT MISHAPS:
window.onbeforeunload = function() {
    return true;
};

// STORAGE:
var canStore = (typeof(Storage) !== "undefined");
window.saveVal = function(name, val) {
    if (canStore) localStorage.setItem(name, val);
}

// HTML SHIT:
function updateObjectCount(count) {
    objectCount.innerHTML = count;
};

// IMPORTS:
var THREE = require("three");
THREE.OBJLoader = require("./libs/OBJLoader.js")(THREE);
THREE.PointerLockControls = require("./libs/PointerLockControls.js")(THREE);
require("./libs/TransformControls.js")(THREE);
const prefabs = require("./data/prefabs.js").prefabs;
const PREFABS = require("./data/prefabs.js");
const texturePrefabs = PREFABS.texturePrefabs;
const loadTexturePrefab = PREFABS.loadTexturePrefab;
const initScene = require("./libs/render.js").initScene;
const biomes = require("./data/map.js").biomes;
const GEOS = require("./libs/geos.js");
const UTILS = require("./libs/utils.js");
const config = require("./config.js");

// TEST MAP:
window.testMap = function() {
    var mapData = editor.getMapExport();
    window.saveVal("custMap", mapData);
    window.open("/", '_blank');
};

// CUSTOM OBJECT:
class ObjectInstance extends THREE.Object3D {
    get prefab() {
        return prefabs[this.objType];
    }

    get texturePrefab() {
        return texturePrefabs[this._texture];
    }

    get pos() { return this.boundingMesh.position.toArray(); }
    set pos(v) { this.boundingMesh.position.fromArray(v); }

    get rot() { return this.boundingMesh.rotation.toArray().slice(0, 3); }
    set rot(v) { this.boundingMesh.rotation.copy(new THREE.Euler(...v)); }

    get size() { return this.boundingMesh.scale.toArray(); }
    set size(v) { this.boundingMesh.scale.fromArray(v); }

    get defaultSize() {
        if (this.prefab.defaultSize) return this.prefab.defaultSize;

        // Calculate box from this object
        let bb = ObjectInstance.tmpBox3.setFromObject(this);
        return [
            bb.max.x - bb.min.x,
            bb.max.y - bb.min.y,
            bb.max.z - bb.min.z
        ];
    }

    get texture() { return this._texture; }
    set texture(texture) {
        if (this.prefab.noTexture) return;
        if (!(texture in texturePrefabs)) throw "Invalid texture id.";

        // Save the src
        this._texture = texture;

        // Update texture, if exists
        this.defaultMaterial.transparent = true;
        if (this.texturePrefab.src) this.defaultMaterial.map = loadTexturePrefab(texture);
        else this.defaultMaterial.map = undefined;

        // Update the material
        this.defaultMaterial.needsUpdate = true;
    }

    get collidable() { return this._collidable; }
    set collidable(c) {
        if (!this.prefab.tool) {
            this._collidable = c;
            if (this.boxShape) this.boxShape.material = c?ObjectInstance.boundingCollidableBoxMaterial
                :ObjectInstance.boundingNoncollidableBoxMaterial;
        }
    }

    get penetrable() { return this._penetrable; }
    set penetrable(c) {
        if (this.prefab.editPen) this._penetrable = c;
    }

    get boost() { return this._boost }
    set boost(b) { this._boost = b }

    get visible() { return this._visible; }
    set visible(c) {
        this._visible = c;
        if (this.defaultMaterial) {
            this.defaultMaterial.opacity = (c?(this.prefab.opacity||this.opacity||1):0);
        }
    }

    get team() { return this._team; }
    set team(c) { this._team = c; }

    get color() { return this._color; }
    set color(c) {
        if (this.prefab.editColor) {
            this._color = c;
            this.defaultMaterial.color.set(GEOS.getColor(c));
        }
    }

    get emissive() { return this._emissive; }
    set emissive(c) {
        if (this.prefab.editEmissive) {
            this._emissive = c;
            this.defaultMaterial.emissive.set(GEOS.getColor(c));
        }
    }

    get opacity() { return this._opacity; }
    set opacity(c) {
        if (this.prefab.editOpac) {
            this._opacity = c;
            this.defaultMaterial.opacity = c;
            this.defaultMaterial.transparent = (c != 1);
        }
    }

    get direction()  {
        if (this.prefab.customDirection) return this._direction;
        else return undefined;
    }
    set direction(d) {
        // Add default direction
        if (this.prefab.customDirection && d === undefined) {
            d = 0;
        }

        // Save the direction
        this._direction = d;

        // Update the arrow
        if (d !== undefined && this.prefab.customDirection) {
            let angle = d * Math.PI / 2;
            this.arrowHelper.setDirection(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
        }
    }

    constructor(data, useID) {
        super();

        // Save the object type
        data.id = data.id||0;
        if (!useID) data.id = config.prefabIDS[data.id];
        if (!prefabs.hasOwnProperty(data.id)) {
            throw "Invalid type: " + data.id;
        }
        this.objType = data.id;

        // Create bounding mesh; this will need to be manually added to the scene
        this.boundingMesh = new THREE.Mesh(ObjectInstance.boundingMeshGeometry, ObjectInstance.boundingMeshMaterial);
        this.boundingMesh.userData.owner = this;

        // Add box to bounding mesh
        if (!this.prefab.hideBoundingBox) {
            this.boxShape = new THREE.LineSegments(ObjectInstance.boundingBoxGeometry,
                this.prefab.lineCol!=undefined?new THREE.LineBasicMaterial({color:this.prefab.lineCol})
                :ObjectInstance.boundingCollidableBoxMaterial);
        }

        // Add arrow to mesh
        if (this.prefab.customDirection) {
            this.arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(), new THREE.Vector3(), 10, 0xff00ff, 5, 4);
        }

        // Create default material and mesh for storing things like procedural geometries in, this will be empty for
        // other items
        this.defaultMaterial = new THREE.MeshLambertMaterial();
        this.defaultMaterial.opacity = (this.prefab.opacity!=undefined?this.prefab.opacity:1);
        this.defaultMaterial.transparent = true;
        this.defaultMaterial.vertexColors = THREE.VertexColors;
        this.defaultMesh = new THREE.Mesh(new THREE.Geometry(), this.defaultMaterial);
        this.add(this.defaultMesh);

        // Save data (this will update the object form the setters) (this will also procedurally create the prefab
        // geometry)
        this.pos = data.p;
        this.rot = data.r || [0, 0, 0];
        this.size = data.s || this.defaultSize;
        if (UTILS.isString(data.t)) this.texture = (data.t||ObjectInstance.DEFAULT_TEXTURE);
        else this.texture = (config.textureIDS[data.t||0])||ObjectInstance.DEFAULT_TEXTURE;
        this.collidable = (data.col===undefined?true:false);
        this.penetrable = (data.pe?true:false);
        this.boost = (!!data.b);
        this.team = (data.tm||0);
        this.visible = (data.v===undefined?true:false);
        this.terrain = data.ter||false;
        this.color = (data.c!=undefined?data.c:0xffffff);
        this.emissive = (data.e!=undefined?data.e:0x000000);
        this.opacity = (data.o!=undefined?data.o:1);
        this.direction = data.d; // May be undefined

        // Generate the content
        let prefabPromises = [];
        if (this.prefab.editorGen) {
            prefabPromises.push(this.prefab.editorGen(this, this.defaultMaterial));
        } else if (this.prefab.gen) {
            prefabPromises.push(this.prefab.gen(this, this.defaultMaterial));
        }

        Promise.all(prefabPromises).then(() => {
            this.traverse(child => {
                child.castShadow = this.prefab.castShadow;
                child.receiveShadow = this.prefab.receiveShadow;
            });
            this.size = data.s || this.defaultSize;
        });

        // Misc
        this.previousScale = new THREE.Vector3();
    }

    static defaultFromType(id) {
        return new ObjectInstance({
            id, p: [0, 0, 0]
        }, true);
    }

    update(dt) {
        if (this.prefab.dontRound) {
            const minScale = 0.00001;
            this.boundingMesh.scale.x = Math.max(minScale, this.boundingMesh.scale.x);
            this.boundingMesh.scale.y = Math.max(minScale, this.boundingMesh.scale.y);
            this.boundingMesh.scale.z = Math.max(minScale, this.boundingMesh.scale.z);
        } else {
            const minScale = 1;
            this.boundingMesh.scale.x = Math.max(minScale, this.boundingMesh.scale.x).roundToNearest(1);
            this.boundingMesh.scale.y = Math.max(minScale, this.boundingMesh.scale.y).roundToNearest(1);
            this.boundingMesh.scale.z = Math.max(minScale, this.boundingMesh.scale.z).roundToNearest(1);
        }

        // Copy position in local coordinates
        this.position.set(0, this.boundingMesh.scale.y / 2, 0);
        this.position.applyQuaternion(this.boundingMesh.quaternion);
        this.position.add(this.boundingMesh.position);

        // Copy rotation
        this.quaternion.copy(this.boundingMesh.quaternion);

        // Invert rotation for box shape
        if (this.boxShape) {
            this.boxShape.position.copy(this.boundingMesh.position);
            this.boxShape.position.y += this.boundingMesh.scale.y / 2;
            this.boxShape.scale.copy(this.boundingMesh.scale);
            this.boxShape.rotation.copy(this.boundingMesh.rotation);
        }

        // Update arrow and make it hover above the object
        if (this.arrowHelper) {
            this.arrowHelper.position.copy(this.boundingMesh.position);
            this.arrowHelper.position.y += this.boundingMesh.scale.y + 5;
        }

        // UPDATE MESH WITH NEW SIZE:
        let newScale = this.boundingMesh.scale;
        if (!this.previousScale.equals(newScale)) {
            // Handle new size
            if (this.prefab.genGeo) {
                // Generate geometry with new size
                this.prefab.genGeo(this.size, 1).then(geo => {
                    this.defaultMesh.geometry = geo;
                });
            } else if (this.prefab.scaleWithSize) {
                this.scale.copy(newScale);
            }

            // Save previous scale
            this.previousScale.copy(newScale);
        }

        // Reset scale if not scalable
        if (!this.prefab.scalable) this.size = this.defaultSize;
    }

    clone() {
        return ObjectInstance.deserialize(this.serialize());
    }

    serialize() {
        let data = {
            p: this.pos,
            s: this.size
        };
        var tID = config.prefabIDS.indexOf(this.objType);
        if (tID) data.id = tID;
        if (data.id === -1) alert("WARNING: No prefab id for type " + this.objType + ".");
        data.p[0] = Math.round(data.p[0]);
        data.p[1] = Math.round(data.p[1]);
        data.p[2] = Math.round(data.p[2]);
        data.s[0] = Math.round(data.s[0]);
        data.s[1] = Math.round(data.s[1]);
        data.s[2] = Math.round(data.s[2]);
        if (!this.collidable) data.col = (!this.collidable)?1:0;
        if (this.penetrable) data.pe = 1;
        if (this.boost) data.b = true;
        if (!this.visible) data.v = 1;
        let rot = this.rot;
        if (rot[0] || rot[1] || rot[2]) data.r = rot.map(v => v.round(2));
        if (this.color != 0xffffff) data.c = this.color;
        if (this.emissive != 0x000000) data.e = this.emissive;
        if (this.opacity != 1) data.o = this.opacity;
        if (this.prefab.texturable) {
            var tmpT = config.textureIDS.indexOf(this.texture);
            if (tmpT) data.t = tmpT
        } if (this.prefab.customDirection) data.d = this.direction;
        return data;
    }
    static deserialize(data) {
        return new ObjectInstance(data);
    }
}

ObjectInstance.DEFAULT_TEXTURE = "DEFAULT";
ObjectInstance.tmpBox3 = new THREE.Box3();
ObjectInstance.boundingMeshGeometry = new THREE.BoxBufferGeometry(1, 1, 1);
ObjectInstance.boundingMeshGeometry.translate(0, 0.5, 0);
ObjectInstance.boundingMeshMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, visible: false });
ObjectInstance.boundingBoxGeometry = (() => {
    const s = 0.5;
    let geometry = new THREE.Geometry();
    geometry.vertices.push(
        // X
        new THREE.Vector3(-s, -s, -s), new THREE.Vector3(s, -s, -s),
        new THREE.Vector3(-s, s, -s), new THREE.Vector3(s, s, -s),
        new THREE.Vector3(-s, s, s), new THREE.Vector3(s, s, s),
        new THREE.Vector3(-s, -s, s), new THREE.Vector3(s, -s, s),

        // Y
        new THREE.Vector3(-s, -s, -s), new THREE.Vector3(-s, s, -s),
        new THREE.Vector3(-s, -s, s), new THREE.Vector3(-s, s, s),
        new THREE.Vector3(s, -s, s), new THREE.Vector3(s, s, s),
        new THREE.Vector3(s, -s, -s), new THREE.Vector3(s, s, -s),

        // Z
        new THREE.Vector3(-s, -s, -s), new THREE.Vector3(-s, -s, s),
        new THREE.Vector3(-s, s, -s), new THREE.Vector3(-s, s, s),
        new THREE.Vector3(s, s, -s), new THREE.Vector3(s, s, s),
        new THREE.Vector3(s, -s, -s), new THREE.Vector3(s, -s, s),
    );
    return geometry;
})();
ObjectInstance.boundingCollidableBoxMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
ObjectInstance.boundingNoncollidableBoxMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });


// EDITOR OBJECT:
const editor = {

    // INIT:
    init(container) {
        this.container = container;

        this.objInstances = [];
        this.boundingMeshes = [];

        this.mapConfig = {
            name: "New Krunker Map",
            modURL: "",
            ambient: 0x97a0a8,
            light: 0xf2f8fc,
            sky: 0xdce8ed,
            fog: 0x8d9aa0,
            fogD: 900
        };

        this.createObjects = { };
        for (let id in prefabs) {
            if (!prefabs.hasOwnProperty(id)) continue;
            this.createObjects[id] = () => this.addObject(ObjectInstance.defaultFromType(id));
        }

        this.objConfig = {
            texture: "DEFAULT",
            color: 0xffffff,
            emissive: 0x000000,
            opacity: 1,
            collidable: true,
            penetrable: false,
            boost: true,
            team: 0,
            visible: true
        };

        this.clock = new THREE.Clock();
        this.initRenderer();
        this.initScene();
        this.initGUI();
        this.initControls();
        this.registerEvents();
        this.setSnapping(true);

        this.render();
    },

    // INIT SCENE:
    initScene() {

        // SCENE:
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0);

        // CAMERA:
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000);

        // SCENE STYLING:
        initScene.call(this, this.mapConfig);

        // GRID:
        this.updateGridHelper();
    },

    // INIT GUI:
    initGUI() {

        // GUI:
        let gui = new dat.GUI();
        let mapGUI = gui.addFolder("Map Config");
        mapGUI.add(this.mapConfig, "name").name("Name").listen();
        mapGUI.add(this.mapConfig, "modURL").name("Mod URL").listen();

        mapGUI.addColor(this.mapConfig, "ambient").name("Ambient Light").onChange(v => {
            this.ambientLight.color.set(v);
        });
        mapGUI.addColor(this.mapConfig, "sky").name("Sky Color").onChange(v => {
            this.scene.background = new THREE.Color(v);
        });
        mapGUI.addColor(this.mapConfig, "light").name("Light Color").onChange(v => {
            this.skyLight.color.set(v);
        });
        mapGUI.addColor(this.mapConfig, "fog").name("Fog Color").onChange(v => {
            this.scene.fog.color.set(v);
        });
        mapGUI.add(this.mapConfig, "fogD", 10, 2000).name("Fog Distance").listen().onChange(v => {
            this.scene.fog.far = v;
        });

        let createGUI = gui.addFolder("Create Object");
        for (let id in prefabs) {
            if (!prefabs.hasOwnProperty(id)) continue;
            createGUI.add(this.createObjects, id).name(this.formatConstName(id));
        }
        createGUI.open();

        this.objConfigGUI = gui.addFolder("Object Config");
        this.objConfigGUI.open();
        this.objConfigOptions = [];

        gui.open();

        // OBJECT COMMANDS:
        document.getElementById("deleteObject").addEventListener("click", ev => {
            this.removeObject();
        });
        document.getElementById("duplicateObject").addEventListener("click", ev => {
            this.duplicateObject();
        });

        // MAP COMMANDS:
        document.getElementById("importMap").addEventListener("click", ev => {
            this.importMap();
        });
        document.getElementById("exportMap").addEventListener("click", ev => {
            this.exportMap();
        });
    },

    // INIT RENDERER:
    initRenderer() {

        // RENDERER:
        this.renderer = new THREE.WebGLRenderer({
            precision: "mediump",
    		powerPreference: "high-performance",
    		antialias: false
        });
        this.renderer.setPixelRatio(window.devicePixelRatio * 0.6);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        // RAYCASTER:
        this.raycaster = new THREE.Raycaster();

    },

    // INIT CONTROLS:
    moveSprint: false,
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false,
    transformOptionIds: ["translateOption", "rotateOption", "scaleOption"],
    spaceOptionIds: ["worldSpaceOption", "localSpaceOption"],
    initControls() {
        // POINTER LOCK:
        let havePointerLock = "pointerLockElement" in document || "mozPointerLockElement" in document || "webkitPointerLockElement" in document;
        if (havePointerLock) {
            let element = this.renderer.domElement;

            // Declare callbacks
            let pointerLockChange = () => {
                // noinspection JSUnresolvedVariable
                this.controls.enabled = document.pointerLockElement === element || document.mozPointerLockElement === element || document.webkitPointerLockElement === element;
            };
            let pointerLockError = ev => {
                console.error("Pointer lock error.", ev);
            };

            // Hook pointer lock state change events
            document.addEventListener("pointerlockchange", pointerLockChange, false);
            document.addEventListener("mozpointerlockchange", pointerLockChange, false);
            document.addEventListener("webkitpointerlockchange", pointerLockChange, false);
            document.addEventListener("pointerlockerror", pointerLockError, false);
            document.addEventListener("mozpointerlockerror", pointerLockError, false);
            document.addEventListener("webkitpointerlockerror", pointerLockError, false);

            // Lock and unlock pointer on right click
            element.addEventListener("mousedown", (event) => {
                if (event.which === 3 || event.button === 2) {
                    element.requestPointerLock = element.requestPointerLock || element.mozRequestPointerLock || element.webkitRequestPointerLock;
                    element.requestPointerLock();
                }
            }, false);
            element.addEventListener("mouseup", (event) => {
                if (event.which === 3 || event.button === 3) {
                    document.exitPointerLock();
                }
            })
        } else {
            alert("Your browser does not support pointer lock.");
        }

        // KEYS:
        document.addEventListener("keydown", ev => {
            if (this.isTyping(ev)) return;
            switch (ev.keyCode) {
                case 16: // shift
                    this.moveSprint = true;
                    break;
                case 38: // up
                case 87: // w
                    this.moveForward = true;
                    break;
                case 37: // left
                case 65: // a
                    this.moveLeft = true; break;
                case 40: // down
                case 83: // s
                    this.moveBackward = true;
                    break;
                case 39: // right
                case 68: // d
                    this.moveRight = true;
                    break;
                case 81: // q
                case 90: // z
                    this.moveDown = true;
                    break;
                case 69: // e
                case 88: // x
                    this.moveUp = true;
                    break;
            }
        }, false);
        document.addEventListener("keyup", ev => {
            if (this.isTyping(ev)) return;
            switch (ev.keyCode) {
                case 16: // shift
                    this.moveSprint = false;
                    break;
                case 38: // up
                case 87: // w
                    this.moveForward = false;
                    break;
                case 37: // left
                case 65: // a
                    this.moveLeft = false;
                    break;
                case 40: // down
                case 83: // s
                    this.moveBackward = false;
                    break;
                case 39: // right
                case 68: // d
                    this.moveRight = false;
                    break;
                case 81: // q
                case 90: // z
                    this.moveDown = false;
                    break;
                case 69: // e
                case 88: // x
                    this.moveUp = false;
                    break;
            }
        }, false);

        // POINTER LOCK CONTROLS:
        this.controls = new THREE.PointerLockControls(this.camera);
        this.scene.add(this.controls.getObject());
        this.controls.getObject().position.set(0, 50, 100);

        // TRANSFORM CONTROLS:
        this.transformControl = new THREE.TransformControls(this.camera, this.renderer.domElement);
        this.transformControl.addEventListener("mouseUp", () => {
            this.updateObjConfigGUI();
        });
        this.scene.add(this.transformControl);

        // TRANSFORM BUTTONS:
        for (let i = 0; i < this.transformOptionIds.length; i++) {
            let optionId = this.transformOptionIds[i];
            let option = document.getElementById(optionId);
            option.addEventListener("click", () => this.setTransformType(i));
        }
        this.setTransformType(0);

        // SPACE BUTTONS:
        for (let i = 0; i < this.spaceOptionIds.length; i++) {
            let optionId = this.spaceOptionIds[i];
            let option = document.getElementById(optionId);
            option.addEventListener("click", () => this.setTransformSpace(i));
        }
        this.setTransformSpace(0);
    },

    // REGISTER EVENTS:
    registerEvents() {
        // Key down event
        window.addEventListener("keydown", ev => {
            if (this.isTyping(ev)) return;
            switch (ev.keyCode) {
                case 49: // 1
                    this.setTransformType(0);
                    break;
                case 50: // 2
                    this.setTransformType(1);
                    break;
                case 51: // 3
                    this.setTransformType(2);
                    break;
                case 192: // grave accent
                    this.setTransformSpace(this.transformSpace === 0 ? 1 : 0);
                    break;
                case 8:
                case 46: // delete, backspace
                    this.removeObject();
                    break;
                case 80: // p
                    this.addPlaceholder();
                    break;
                case 82: // r
                    ev.shiftKey && this.duplicateObject()
                    break;
            }
        });

        // Click event
        this.container.addEventListener("mousedown", () => {
            // Make sure only left clicking
            if (event.which !== 1 && event.button !== 0) return;

            // Test the event
            let rayPoint = new THREE.Vector2(
                (event.clientX / window.innerWidth) * 2 - 1,
                -(event.clientY / window.innerHeight) * 2 + 1
            );
            this.raycaster.setFromCamera(rayPoint, this.camera);

            // Handle the transform selection
            let intersects = this.raycaster.intersectObjects(this.boundingMeshes);
            if (intersects.length > 0) {
                let selected = intersects[0].object;
                this.attachTransform(selected);
            } else {
                this.hideTransform();
            }
        });
    },

    // RENDER:
    render() {

        // Get the delta time
        let dt = this.clock.getDelta();

        // Find move direction
        let moveDirection = new THREE.Vector3(0, 0, 0);
        if (this.moveForward) moveDirection.z -= 1;
        if (this.moveBackward) moveDirection.z += 1;
        if (this.moveLeft) moveDirection.x -= 1;
        if (this.moveRight) moveDirection.x += 1;
        if (this.moveUp) moveDirection.y += 1;
        if (this.moveDown) moveDirection.y -= 1;

        // Move the camera
        let moveSpeed = this.moveSprint ? 180 : 70;
        // this.scene.updateMatrixWorld();
        moveDirection.applyQuaternion(this.camera.getWorldQuaternion());
        this.controls.getObject().position.add(moveDirection.multiplyScalar(moveSpeed * dt));

        // Update all of the instances
        for (let instance of this.objInstances) {
            instance.update(dt);
        }

        // Do the render
        this.renderer.render(this.scene, this.camera);
        this.transformControl.update();
        requestAnimationFrame(() => this.render());
    },

    // OBJECT MANAGEMENT:
    addObject(instance) {
        // Create object
        this.scene.add(instance);
        this.objInstances.push(instance);
        updateObjectCount(this.objInstances.length);

        // Add the bounding mesh
        this.scene.add(instance.boundingMesh);
        if (instance.boxShape) this.scene.add(instance.boxShape);
        this.boundingMeshes.push(instance.boundingMesh);

        // Add the arrow
        if (instance.arrowHelper) this.scene.add(instance.arrowHelper);

        // Select item
        this.attachTransform(instance.boundingMesh);
    },
    removeObject(object) {
        // Remove the object passed in or the selected object
        object = object ? object.boundingMesh : this.transformControl.object;
        if (object) {
            // Remove the instance
            let instance = object.userData.owner;
            this.objInstances.splice(this.objInstances.indexOf(instance), 1);
            updateObjectCount(this.objInstances.length);
            this.scene.remove(instance);

            // Remove the bounding mesh
            this.boundingMeshes.splice(this.boundingMeshes.indexOf(object), 1);
            this.scene.remove(object);
            if (instance.boxShape) this.scene.remove(instance.boxShape);

            // Remove the arrow
            if (instance.arrowHelper) this.scene.remove(instance.arrowHelper);

            // Remove transform
            this.hideTransform();
        } else {
            console.log("No object to remove.");
        }
    },
    duplicateObject() {
        // Duplicate the object if selected
        let object = this.transformControl.object;
        if (object) {
            // Remove the instance
            let oldInstance = object.userData.owner;
            let newInstance = oldInstance.clone();
            this.addObject(newInstance);

            // Select the object
            this.attachTransform(newInstance.boundingMesh);
        } else {
            console.log("No object to duplicate.");
        }
    },

    // GET MAP EXPORT:
    getMapExport() {
        let objects = [];
        let spawns = [];
        let camPos = [0, 0, 0];
        for (let instance of this.objInstances) {
            if (instance.objType === "SPAWN_POINT") {
                var tmpArray = [instance.pos[0], instance.pos[1], instance.pos[2]];
                if (instance.team) tmpArray.push(parseInt(instance.team));
                spawns.push(tmpArray);
            } else if (instance.objType === "CAMERA_POSITION") {
                camPos = instance.pos;
            } else objects.push(instance.serialize());
        }
        let map = Object.assign({}, this.mapConfig, { camPos, spawns, objects });
        return JSON.stringify(map);
    },

    // MAP MANAGEMENT:
    exportMap() {
        var text = this.getMapExport();
        var element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        element.setAttribute('download', this.mapConfig.name);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    },
    importMap() {
        // Prompt to get text
        let mapRaw = prompt("Copy Paste Map Text Here");
        if (!mapRaw || mapRaw == "") return;

        // Parse the map
        try {

            // Parse map
            let map = JSON.parse(mapRaw);

            // Clear the map
            this.clearMap();

            // Create the objects
            for (let data of map.objects) {
                this.addObject(ObjectInstance.deserialize(data));
            }
            delete map.objects; // Remove so it's not part of the map config

            // Add the camera position and spawn points
            if (map.camPos) this.addObject(new ObjectInstance({ id: 6, p: map.camPos }));
            for (let point of map.spawns) {
                this.addObject(new ObjectInstance({ id: 5, p: [point[0], point[1], point[2]],
                    tm: point[3] }));
            }

            // Save config
            Object.assign(this.mapConfig, map);
        } catch (e) {
            console.log(e);
            alert("Failed to import map with error:\n" + e.toString());
        }
    },
    
    // OBJECT REPLACEMENT
    replaceObject(str) {
        // Replace the object passed in or the selected object
        let object = this.transformControl.object;
        if (object) {
            
            // Parse the map
            try {
                
                // Remove the selected object
                this.removeObject(object);
                
                let data = JSON.parse(str);
                data = data.objects ? data.objects : data
                
                // Find center of objects
                let center = this.findCenter(data)
                
                // Correct position of the objects
                for (let obj of data) {
                    obj.p[0] += object.userData.owner.position.x - center[0]
                    obj.p[1] += object.userData.owner.position.y - (object.scale.y / 2) - center[1]
                    obj.p[2] += object.userData.owner.position.z - center[2]
                    
                    this.addObject(ObjectInstance.deserialize(obj))
                }
            } catch (e) {
                console.log(e);
                alert("Failed to replace object with error:\n" + e.toString());
            }
        } else {
            console.log("No object to replace.");
        }  
    },
    importObject(fromfile = false) {
        if (fromfile) {
            // Create File input Dialog
            let file = document.createElement('input');
            file.type = 'file';
            file.id = 'file_input';
            
            let self = this;
            file.addEventListener('change', ev => {
                let files = ev.target.files;
                if (files.length != 1) return alert('Please select 1 file');
                let f = files[0];
                let reader = new FileReader();

                reader.onload = (theFile => {
                    return e => {
                        self.replaceObject(e.target.result);
                    };
                })(f);

                reader.readAsText(f);
            }, false);
            
            file.type = 'file';
            file.id = 'file_input';
            file.click();
            return;
        }
        
        // Prompt to get text
        let objectRaw = prompt("Copy Paste Object Text Here", "");
        if (!objectRaw || objectRaw == "") return;
        
        // Replace Object with inputed text
        this.replaceObject(objectRaw)
    },
    findCenter(data) {
        let min = data[0].p[1],
        xMin = data[0].p[0] - (data[0].s[0] /2),
        xMax = data[0].p[0] + (data[0].s[0] /2),
        yMin = data[0].p[2] - (data[0].s[2] /2),
        yMax = data[0].p[2] + (data[0].s[2] /2)


        for (let obj of data) {
            if (obj.p[1]  < min) min = obj.p[1]
            if (obj.p[0] - (obj.s[0] /2) < xMin) xMin = obj.p[0] - (obj.s[0] /2)
            if (obj.p[0] + (obj.s[0] /2) > xMax) xMax = obj.p[0] + (obj.s[0] /2)
            if (obj.p[2] - (obj.s[2] /2) < yMin) yMin = obj.p[2] - (obj.s[2] /2)
            if (obj.p[2] + (obj.s[2] /2) > yMax) yMax = obj.p[2] + (obj.s[2] /2)
        }

        return [Math.round((xMin + xMax)/2), min, Math.round((yMin + yMax)/2)]
    },
    
    // PLACEHOLDER
    addPlaceholder() {
        // Get camera position
        let pos = this.camera.getWorldPosition()
        
        // Create Object on camera position to use as placeholder
        this.addObject(new ObjectInstance({p: [pos.x, pos.y - 10, pos.z], s: [10, 10, 10], e: 16777215, o: 0.3, c: 0}))
    },

    // TRANSFORM MANAGEMENT:
    attachTransform(object) {
        if (object instanceof ObjectInstance) object = object.boundingMesh;
        this.transformControl.attach(object);
        this.updateObjConfigGUI();
    },
    hideTransform() {
        this.transformControl.detach(this.transformControl.object);
        this.updateObjConfigGUI();
    },
    setTransformType(type) {
        // Update the mode
        let typeString;
        switch (type) {
            case 0:
                typeString = "translate";
                break;
            case 1:
                typeString = "rotate";
                break;
            case 2:
                typeString = "scale";
                break;
        }
        this.transformControl.setMode(typeString);

        // Set the appropriate transform button to active
        for (let i = 0; i < this.transformOptionIds.length; i++) {
            let optionId = this.transformOptionIds[i];
            let option = document.getElementById(optionId);
            if (i === type) {
                option.classList.add("selected");
            } else {
                option.classList.remove("selected");
            }
        }

        // Transform does not allow for scaling in world space, so we need to force local space when scaling
        if (type === 2) {
            this.setTransformSpace(1);
        }
    },
    transformSpace: 0,
    setTransformSpace(type) {
        // Set the space
        this.transformSpace = type;
        let typeString;
        switch (type) {
            case 0:
                typeString = "world";
                break;
            case 1:
                typeString = "local";
                break;
        }
        this.transformControl.setSpace(typeString);

        // Set the appropriate space button to active
        for (let i = 0; i < this.spaceOptionIds.length; i++) {
            let optionId = this.spaceOptionIds[i];
            let option = document.getElementById(optionId);
            if (i === type) {
                option.classList.add("selected");
            } else {
                option.classList.remove("selected");
            }
        }
    },
    snappingEnabled: true,
    translationSnapping: 1,
    rotationSnapping: 10,
    setSnapping(enabled) {
        this.snappingEnabled = enabled;
        this.updateSnapping();
    },
    updateSnapping() {

        // Set snapping
        this.transformControl.setTranslationSnap(this.snappingEnabled ? this.translationSnapping : null);
        this.transformControl.setRotationSnap(this.snappingEnabled ? THREE.Math.degToRad(this.rotationSnapping) : null);

        // Update grid helper
        this.updateGridHelper();
    },
    updateGridHelper() {
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }

        // Create new grid helper
        let gridSize = 100;
        let gridSpacing = 10;
        this.gridHelper = new THREE.GridHelper(gridSize, gridSize / gridSpacing);
        this.gridHelper.material.opacity = 0.25;
        this.gridHelper.material.transparent = true;
        this.scene.add(this.gridHelper);
    },

    // MISC:
    clearMap() {
        // Remove each object
        while (this.objInstances.length > 0) {
            // `removeObject` will remove this value from the array
            this.removeObject(this.objInstances[0]);
            updateObjectCount(0);
        }
    },
    xyzKeys: ["X", "Y", "Z"],
    updateObjConfigGUI() {
        // Remove all previous options
        for (let option of this.objConfigOptions) {
            // Remove folder or option with appropriate method
            if (option instanceof dat.GUI) {
                this.objConfigGUI.removeFolder(option);
            } else {
                this.objConfigGUI.remove(option);
            }
        }
        this.objConfigOptions.length = 0;

        // Get selected object
        let selected = this.transformControl.object;
        if (!selected) return;
        let instance = selected.userData.owner;

        // Update values of config
        this.objConfig.pos = instance.pos;
        this.objConfig.rot = instance.rot;
        this.objConfig.size = instance.size;
        this.objConfig.texture = instance.texture;
        this.objConfig.collidable = instance.collidable;
        this.objConfig.penetrable = instance.penetrable;
        this.objConfig.boost = instance.boost;
        this.objConfig.team = instance.team;
        this.objConfig.visible = instance.visible;
        this.objConfig.color = instance.color;
        this.objConfig.emissive = instance.emissive;
        this.objConfig.opacity = instance.opacity;
        this.objConfig.direction = instance.direction;
        let o;

        // BOOLEANS:
        if (!instance.prefab.tool) {
            o = this.objConfigGUI.add(this.objConfig, "visible").name("Visible").listen().onChange(c => {
                instance.visible = c;
            });
            this.objConfigOptions.push(o);
        } if (!instance.prefab.tool) {
            o = this.objConfigGUI.add(this.objConfig, "collidable").name("Collidable").listen().onChange(c => {
                instance.collidable = c;
            });
            this.objConfigOptions.push(o);
        } if (instance.prefab.editPen) {
            o = this.objConfigGUI.add(this.objConfig, "penetrable").name("Penetrable").listen().onChange(c => {
                instance.penetrable = c;
            });
            this.objConfigOptions.push(o);
        }  if (instance.prefab.boostable) {
            o = this.objConfigGUI.add(this.objConfig, "boost").name("Boost").listen().onChange(c => {
                instance.boost = c;
            });
            this.objConfigOptions.push(o);
        }

        // COLOR:
        if (instance.prefab.texturable) {
            let options = {
                "Default": "DEFAULT"
            };
            for (let key in texturePrefabs) {
                if (key != "DEFAULT") {
                    if (!texturePrefabs.hasOwnProperty(key)) continue;
                    options[this.formatConstName(key)] = key;
                }
            }
            o = this.objConfigGUI.add(this.objConfig, "texture").options(options).name("Texture").listen().onChange(prefabId => {
                instance.texture = prefabId;
            });
            this.objConfigOptions.push(o);
        } if (instance.prefab.editColor) {
            o = this.objConfigGUI.addColor(this.objConfig, "color").name("Color").onChange(c => {
                instance.color = c;
            });
            this.objConfigOptions.push(o);
        } if (instance.prefab.editEmissive) {
            o = this.objConfigGUI.addColor(this.objConfig, "emissive").name("Emissive").onChange(c => {
                instance.emissive = c;
            });
            this.objConfigOptions.push(o);
        } if (instance.prefab.editOpac) {
            o = this.objConfigGUI.add(this.objConfig, "opacity", 0, 1, 0.1).name("Opacity").onChange(c => {
                instance.opacity = c;
            });
            this.objConfigOptions.push(o);
        }

        // OTHER:
        if (instance.prefab.customDirection) {
            o = this.objConfigGUI.add(this.objConfig, "direction", 0, 3, 1).name("Direction").onChange(d => {
                instance.direction = d;
            });
            this.objConfigOptions.push(o);
        } if (instance.prefab.teamable) {
            var teams = {
                "Default": 0,
                "Team 1": 1,
                "Team 2": 2
            };
            o = this.objConfigGUI.add(this.objConfig, "team").options(teams).name("Team").listen().onChange(c => {
                instance.team = c;
            });
            this.objConfigOptions.push(o);
        }

        // POS,ROT,SCL GUI:
        const arrayAttribute = (instanceKey, array, name) => {
            o = this.objConfigGUI.addFolder(name);
            for (let i = 0; i < 3; i++) {
                o.add(array, i).name(this.xyzKeys[i]).onChange(v => {
                    instance[instanceKey] = array;
                });
            }
            this.objConfigOptions.push(o);
        };
        arrayAttribute("pos", this.objConfig.pos, "Position");
        arrayAttribute("rot", this.objConfig.rot, "Rotation");
        if (instance.prefab.scalable) arrayAttribute("size", this.objConfig.size, "Size");

    },
    formatConstName(original) {
        return original.toLowerCase().split("_").map(s => s.slice(0, 1).toUpperCase() + s.slice(1).toLowerCase()).join(" ")
    },
    isTyping(ev) {
        let targetType = ev.target.getAttribute("type");
        return targetType === "text" || targetType === "number";
    },
    shorten(num) {
        return parseFloat(Math.round(num));
    }
};
editor.init(document.getElementById("container"));
