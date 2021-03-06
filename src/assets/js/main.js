var Supports = require('./Utils/Supports');
var Scene = require('./Utils/Scene');
var Camera = require('./Utils/Camera');
var Listener = require('./Utils/Listener');
var Renderer = require('./Utils/Renderer');
var Ui = require('./UI');

var Terrain = require('./Terrain');
var Sounds = require('./Sounds');
var Animal = require('./Models/animal.js');
var Fish = require('./Models/fish.js');
var Rockbass = require('./Models/rockbass.js');
var Jellyfish = require('./Models/jellyfish.js');
var Catfish = require('./Models/catfish.js');
var Particles = require('./Models/particles.js');
var Lights = require('./Models/lights.js');
// var Lantern = require('./Models/lantern.js');
var Gauge = require('./UI/gauge.js');
var Controls = require('./Controls');
var Raycaster = require('./Controls/raycaster.js');

var dbg = require('debug')('luma:app');

// Enable debug
window.myDebug = require("debug");

if (Supports.isMobile()){
    document.getElementsByTagName('body')[0].classList.add("is-mobile") ;
}

var App = {

    start: function() {
        return this.init();
    },

    init: function() {
        dbg('init');
        this.isPlaying = false;
        this.animalQuantity = 3;
        this.scene = Scene.create();
        this.camera = Camera.create();
        this.listener = Listener.create(this.camera);
        this.renderer = Renderer.create();
        this.animals = [];
        this.progressStatus = [];

        this.clock = new THREE.Clock();

        this.initElements();
        this.initEvents();
        this.getDevice();
        this.launch();
        this.createElements();
        this.initAssets();

        return this;
    },

    initElements: function() {
        dbg('initialize elements');
        this.$els = {
            onboarding: document.getElementById('onboarding'),
            playBtn: document.getElementById('playBtn'),
            cardboardPlayBtn: document.getElementById('cardboardPlayBtn'),
            gyroscopePlayBtn: document.getElementById('gyroscopePlayBtn'),
            toggleAudioBtn: document.getElementById('toggleAudioBtn'),
            wrapper: document.getElementById('wrapper'),
            window: window
        };
    },

    initEvents: function() {
        dbg('initialize events');

        // Listen for fullscreen change events
        document.addEventListener('webkitfullscreenchange', this.onFullScreenChange.bind(this), false);
        document.addEventListener('mozfullscreenchange', this.onFullScreenChange.bind(this), false);
        document.addEventListener('fullscreenchange', this.onFullScreenChange.bind(this), false);
        document.addEventListener('MSFullscreenChange', this.onFullScreenChange.bind(this), false);

        this.$els.playBtn.addEventListener('click', this.play.bind(this));
        this.$els.cardboardPlayBtn.addEventListener('click', this.cardboardPlay.bind(this));
        this.$els.gyroscopePlayBtn.addEventListener('click', this.play.bind(this));
        this.$els.toggleAudioBtn.addEventListener('click', this.toggleAudio.bind(this));
        this.$els.window.addEventListener('resize', this.onWindowResize.bind(this), false );
    },

    cardboardPlay: function () {
        this.play();

        this.renderer = Renderer.setCardboardEffect();
        this.gauge.setMargin(0.9);
    },

    play: function () {
        this.toggleFullScreen();

        if(!this.UICreated) {
            this.createUI();
            Sounds.initVoiceSynthesis();
            this.UICreated = true;
        }
    },

    onFullScreenChange: function () {
        document.isFullScreen = document.fullscreenElement || document.webkitIsFullScreen || document.mozFullScreen || document.msFullscreenElement;
        if (document.isFullScreen) {
            this.$els.onboarding.style.display = 'none';
            this.showUI();
            this.isPlaying = Controls.active = true;
        } else {
            this.$els.onboarding.style.display = 'initial';
            this.hideUI();
            this.isPlaying = Controls.active = false;
            Controls.stop(true);
        }
    },

    toggleFullScreen: function() {
        Ui.toggleFullScreen(this.$els.wrapper,  Supports);
    },

    toggleAudio: function() {
        Ui.toggleAudio(Listener);
    },

    onWindowResize: function() {
        Ui.onWindowResize(Camera, Renderer);
        Gauge.onWindowResize();
    },

    initAssets: function() {
        dbg('load assets');
        Terrain.loadAssets(this.createTerrain.bind(this), this.assetsLoadingProgress.bind(this));
        Fish.loadObjectAssets('assets/js/Models/skinned/fish.json', this.createFishes.bind(this), this.assetsLoadingProgress.bind(this));
        Rockbass.loadJSONAssets('assets/js/Models/skinned/rockbass.json', this.createRockbass.bind(this), this.assetsLoadingProgress.bind(this));
        Catfish.loadJSONAssets('assets/js/Models/skinned/catfish.json', this.createCatfish.bind(this), this.assetsLoadingProgress.bind(this));
        Jellyfish.loadJSONAssets('assets/js/Models/skinned/jellyfish.json', this.createJellyfish.bind(this), this.assetsLoadingProgress.bind(this));
    },

    assetsLoadingProgress: function(progress) {
        this.progressStatus[progress.key] = progress.value;
        var sum = 0;
        var divider = 0;
        for(var key in this.progressStatus) {
            sum += this.progressStatus[key];
            divider ++;
        }
        var percentage = sum / divider;
        TweenMax.to("#logo-overlay", 0.2, {right: (100 - percentage*100) + "%"});
        TweenMax.to("#logo-background", 0.2, {webkitClipPath:'inset(0 ' + (100 - percentage*100) +'% 0 0)'});

        if(percentage == 1) {
            TweenMax.set("#logo-overlay", {autoAlpha: 0});
            if (Supports.isMobile()){
                TweenMax.to(".onboarding__mobile-buttons", 1, {opacity: 1, scale: 1, ease: Power4.easeInOut});
            } else {
                TweenMax.to("#playBtn", 1, {opacity: 1, scale: 1, ease: Power4.easeInOut});

            }
            TweenMax.to("#waitingBackground", 1.5, {opacity: 0, ease: Power4.easeInOut});
            this.render();
        }

        dbg('Global asset loading progress', percentage);
    },

    launch: function() {
        dbg('launch');
        this.scene.add(this.camera);
        this.sound = Sounds.create(this.listener, this.camera);
    },

    createElements: function() {
        dbg('create elements');
        Lights.addAsChild(this.camera, this.scene);
        // Lantern.attachAsChild(this.scene);
        this.particles = Particles.create(this.camera);
    },

    createTerrain: function() {
        dbg('create terrain');
        this.terrain = Terrain.create(this.scene, this.camera);
        this.raycaster = Raycaster.create(this.scene, this.camera, Ui, this.terrain);
    },

    createUI: function() {
        this.gauge = Gauge.create(this.camera, Ui, Renderer);
        window.gauge = this.gauge;
        this.target = Ui.createTarget(this.camera);
    },

    showUI: function () {
        this.gauge.location.visible = true;
        this.gauge.locationText.visible = true;
        this.gauge.marker.visible = true;
        this.target.visible = true;
    },

    hideUI: function () {
        this.gauge.location.visible = false;
        this.gauge.locationText.visible = false;
        this.gauge.marker.visible = false;
        this.target.visible = false;
    },

    createFishes: function() {
        this.createAnimals(Fish, true);
    },

    createRockbass: function() {
        this.createAnimals(Rockbass, true);
    },

    createCatfish: function() {
        this.createAnimals(Catfish, true);
    },

    createJellyfish: function() {
        this.createAnimals(Jellyfish, false);
    },

    createAnimals: function(type, raycast) {
        var key = "create" + type.type;
        this.assetsLoadingProgress({key: key, value: 0});

        var a;
        for(var i = 0 ; i < this.animalQuantity; i++) {
            a = type.create(this.scene, this.listener, this.camera);
            this.animals.push(a);
            if (raycast) Raycaster.addAnimal(a);
            this.assetsLoadingProgress({key: key, value: (i+1) / (this.animalQuantity+1)});
        }

        this.assetsLoadingProgress({key: key, value: 1});
    },

    getDevice: function() {
        dbg('get device');
        touchControls = Controls.initTouchMovements();

        if(Supports.isMobile()) {
            this.rotationControls = Controls.create(this.camera);
        } else {
            this.rotationControls = Controls.createMouse(this.camera);
        }
    },

    render: function() {
        var delta = 0.75 * this.clock.getDelta();

        requestAnimationFrame(this.render.bind(this));

        if(this.isPlaying) {
            this.rotationControls.update();
            this.raycaster.update();
        }
        Camera.render(delta);

        this.renderer.render(this.scene, this.camera);

        Animal.update(this.animals, delta, this.camera);
        
        Ui.updateInfoPanel(this.scene, this.camera, Raycaster.intersected);

        if(this.isPlaying) {
            Sounds.update();

            // Update gauge once per second
            if (!this.gaugeUpdatePending) {
                setTimeout(this.updateGauge.bind(this), 1000);
                this.gaugeUpdatePending = true;
            }
        }
    },

    updateGauge: function() {
        this.gauge.update();
        this.gaugeUpdatePending = false;
    }
};

var app = App.start();
