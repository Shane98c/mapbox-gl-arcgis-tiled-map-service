(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.ArcGISTiledMapServiceSource = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var SphericalMercator = (function(){

// Closures including constants and other precalculated values.
var cache = {},
    EPSLN = 1.0e-10,
    D2R = Math.PI / 180,
    R2D = 180 / Math.PI,
    // 900913 properties.
    A = 6378137.0,
    MAXEXTENT = 20037508.342789244;


// SphericalMercator constructor: precaches calculations
// for fast tile lookups.
function SphericalMercator(options) {
    options = options || {};
    this.size = options.size || 256;
    if (!cache[this.size]) {
        var size = this.size;
        var c = cache[this.size] = {};
        c.Bc = [];
        c.Cc = [];
        c.zc = [];
        c.Ac = [];
        for (var d = 0; d < 30; d++) {
            c.Bc.push(size / 360);
            c.Cc.push(size / (2 * Math.PI));
            c.zc.push(size / 2);
            c.Ac.push(size);
            size *= 2;
        }
    }
    this.Bc = cache[this.size].Bc;
    this.Cc = cache[this.size].Cc;
    this.zc = cache[this.size].zc;
    this.Ac = cache[this.size].Ac;
};

// Convert lon lat to screen pixel value
//
// - `ll` {Array} `[lon, lat]` array of geographic coordinates.
// - `zoom` {Number} zoom level.
SphericalMercator.prototype.px = function(ll, zoom) {
    var d = this.zc[zoom];
    var f = Math.min(Math.max(Math.sin(D2R * ll[1]), -0.9999), 0.9999);
    var x = Math.round(d + ll[0] * this.Bc[zoom]);
    var y = Math.round(d + 0.5 * Math.log((1 + f) / (1 - f)) * (-this.Cc[zoom]));
    (x > this.Ac[zoom]) && (x = this.Ac[zoom]);
    (y > this.Ac[zoom]) && (y = this.Ac[zoom]);
    //(x < 0) && (x = 0);
    //(y < 0) && (y = 0);
    return [x, y];
};

// Convert screen pixel value to lon lat
//
// - `px` {Array} `[x, y]` array of geographic coordinates.
// - `zoom` {Number} zoom level.
SphericalMercator.prototype.ll = function(px, zoom) {
    var g = (px[1] - this.zc[zoom]) / (-this.Cc[zoom]);
    var lon = (px[0] - this.zc[zoom]) / this.Bc[zoom];
    var lat = R2D * (2 * Math.atan(Math.exp(g)) - 0.5 * Math.PI);
    return [lon, lat];
};

// Convert tile xyz value to bbox of the form `[w, s, e, n]`
//
// - `x` {Number} x (longitude) number.
// - `y` {Number} y (latitude) number.
// - `zoom` {Number} zoom.
// - `tms_style` {Boolean} whether to compute using tms-style.
// - `srs` {String} projection for resulting bbox (WGS84|900913).
// - `return` {Array} bbox array of values in form `[w, s, e, n]`.
SphericalMercator.prototype.bbox = function(x, y, zoom, tms_style, srs) {
    // Convert xyz into bbox with srs WGS84
    if (tms_style) {
        y = (Math.pow(2, zoom) - 1) - y;
    }
    // Use +y to make sure it's a number to avoid inadvertent concatenation.
    var ll = [x * this.size, (+y + 1) * this.size]; // lower left
    // Use +x to make sure it's a number to avoid inadvertent concatenation.
    var ur = [(+x + 1) * this.size, y * this.size]; // upper right
    var bbox = this.ll(ll, zoom).concat(this.ll(ur, zoom));

    // If web mercator requested reproject to 900913.
    if (srs === '900913') {
        return this.convert(bbox, '900913');
    } else {
        return bbox;
    }
};

// Convert bbox to xyx bounds
//
// - `bbox` {Number} bbox in the form `[w, s, e, n]`.
// - `zoom` {Number} zoom.
// - `tms_style` {Boolean} whether to compute using tms-style.
// - `srs` {String} projection of input bbox (WGS84|900913).
// - `@return` {Object} XYZ bounds containing minX, maxX, minY, maxY properties.
SphericalMercator.prototype.xyz = function(bbox, zoom, tms_style, srs) {
    // If web mercator provided reproject to WGS84.
    if (srs === '900913') {
        bbox = this.convert(bbox, 'WGS84');
    }

    var ll = [bbox[0], bbox[1]]; // lower left
    var ur = [bbox[2], bbox[3]]; // upper right
    var px_ll = this.px(ll, zoom);
    var px_ur = this.px(ur, zoom);
    // Y = 0 for XYZ is the top hence minY uses px_ur[1].
    var x = [ Math.floor(px_ll[0] / this.size), Math.floor((px_ur[0] - 1) / this.size) ];
    var y = [ Math.floor(px_ur[1] / this.size), Math.floor((px_ll[1] - 1) / this.size) ];
    var bounds = {
        minX: Math.min.apply(Math, x) < 0 ? 0 : Math.min.apply(Math, x),
        minY: Math.min.apply(Math, y) < 0 ? 0 : Math.min.apply(Math, y),
        maxX: Math.max.apply(Math, x),
        maxY: Math.max.apply(Math, y)
    };
    if (tms_style) {
        var tms = {
            minY: (Math.pow(2, zoom) - 1) - bounds.maxY,
            maxY: (Math.pow(2, zoom) - 1) - bounds.minY
        };
        bounds.minY = tms.minY;
        bounds.maxY = tms.maxY;
    }
    return bounds;
};

// Convert projection of given bbox.
//
// - `bbox` {Number} bbox in the form `[w, s, e, n]`.
// - `to` {String} projection of output bbox (WGS84|900913). Input bbox
//   assumed to be the "other" projection.
// - `@return` {Object} bbox with reprojected coordinates.
SphericalMercator.prototype.convert = function(bbox, to) {
    if (to === '900913') {
        return this.forward(bbox.slice(0, 2)).concat(this.forward(bbox.slice(2,4)));
    } else {
        return this.inverse(bbox.slice(0, 2)).concat(this.inverse(bbox.slice(2,4)));
    }
};

// Convert lon/lat values to 900913 x/y.
SphericalMercator.prototype.forward = function(ll) {
    var xy = [
        A * ll[0] * D2R,
        A * Math.log(Math.tan((Math.PI*0.25) + (0.5 * ll[1] * D2R)))
    ];
    // if xy value is beyond maxextent (e.g. poles), return maxextent.
    (xy[0] > MAXEXTENT) && (xy[0] = MAXEXTENT);
    (xy[0] < -MAXEXTENT) && (xy[0] = -MAXEXTENT);
    (xy[1] > MAXEXTENT) && (xy[1] = MAXEXTENT);
    (xy[1] < -MAXEXTENT) && (xy[1] = -MAXEXTENT);
    return xy;
};

// Convert 900913 x/y values to lon/lat.
SphericalMercator.prototype.inverse = function(xy) {
    return [
        (xy[0] * R2D / A),
        ((Math.PI*0.5) - 2.0 * Math.atan(Math.exp(-xy[1] / A))) * R2D
    ];
};

return SphericalMercator;

})();

if (typeof module !== 'undefined' && typeof exports !== 'undefined') {
    module.exports = exports = SphericalMercator;
}

},{}],2:[function(require,module,exports){
/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * Ported from Webkit
 * http://svn.webkit.org/repository/webkit/trunk/Source/WebCore/platform/graphics/UnitBezier.h
 */

module.exports = UnitBezier;

function UnitBezier(p1x, p1y, p2x, p2y) {
    // Calculate the polynomial coefficients, implicit first and last control points are (0,0) and (1,1).
    this.cx = 3.0 * p1x;
    this.bx = 3.0 * (p2x - p1x) - this.cx;
    this.ax = 1.0 - this.cx - this.bx;

    this.cy = 3.0 * p1y;
    this.by = 3.0 * (p2y - p1y) - this.cy;
    this.ay = 1.0 - this.cy - this.by;

    this.p1x = p1x;
    this.p1y = p2y;
    this.p2x = p2x;
    this.p2y = p2y;
}

UnitBezier.prototype.sampleCurveX = function(t) {
    // `ax t^3 + bx t^2 + cx t' expanded using Horner's rule.
    return ((this.ax * t + this.bx) * t + this.cx) * t;
};

UnitBezier.prototype.sampleCurveY = function(t) {
    return ((this.ay * t + this.by) * t + this.cy) * t;
};

UnitBezier.prototype.sampleCurveDerivativeX = function(t) {
    return (3.0 * this.ax * t + 2.0 * this.bx) * t + this.cx;
};

UnitBezier.prototype.solveCurveX = function(x, epsilon) {
    if (typeof epsilon === 'undefined') epsilon = 1e-6;

    var t0, t1, t2, x2, i;

    // First try a few iterations of Newton's method -- normally very fast.
    for (t2 = x, i = 0; i < 8; i++) {

        x2 = this.sampleCurveX(t2) - x;
        if (Math.abs(x2) < epsilon) return t2;

        var d2 = this.sampleCurveDerivativeX(t2);
        if (Math.abs(d2) < 1e-6) break;

        t2 = t2 - x2 / d2;
    }

    // Fall back to the bisection method for reliability.
    t0 = 0.0;
    t1 = 1.0;
    t2 = x;

    if (t2 < t0) return t0;
    if (t2 > t1) return t1;

    while (t0 < t1) {

        x2 = this.sampleCurveX(t2);
        if (Math.abs(x2 - x) < epsilon) return t2;

        if (x > x2) {
            t0 = t2;
        } else {
            t1 = t2;
        }

        t2 = (t1 - t0) * 0.5 + t0;
    }

    // Failure.
    return t2;
};

UnitBezier.prototype.solve = function(x, epsilon) {
    return this.sampleCurveY(this.solveCurveX(x, epsilon));
};

},{}],3:[function(require,module,exports){
'use strict';

if (typeof module !== 'undefined' && module.exports) {
    module.exports = isSupported;
} else if (window) {
    window.mapboxgl = window.mapboxgl || {};
    window.mapboxgl.supported = isSupported;
}

/**
 * Test whether the current browser supports Mapbox GL JS
 * @param {Object} options
 * @param {boolean} [options.failIfMajorPerformanceCaveat=false] Return `false`
 *   if the performance of Mapbox GL JS would be dramatically worse than
 *   expected (i.e. a software renderer is would be used)
 * @return {boolean}
 */
function isSupported(options) {
    return !!(
        isBrowser() &&
        isArraySupported() &&
        isFunctionSupported() &&
        isObjectSupported() &&
        isJSONSupported() &&
        isWorkerSupported() &&
        isUint8ClampedArraySupported() &&
        isWebGLSupportedCached(options && options.failIfMajorPerformanceCaveat)
    );
}

function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isArraySupported() {
    return (
        Array.prototype &&
        Array.prototype.every &&
        Array.prototype.filter &&
        Array.prototype.forEach &&
        Array.prototype.indexOf &&
        Array.prototype.lastIndexOf &&
        Array.prototype.map &&
        Array.prototype.some &&
        Array.prototype.reduce &&
        Array.prototype.reduceRight &&
        Array.isArray
    );
}

function isFunctionSupported() {
    return Function.prototype && Function.prototype.bind;
}

function isObjectSupported() {
    return (
        Object.keys &&
        Object.create &&
        Object.getPrototypeOf &&
        Object.getOwnPropertyNames &&
        Object.isSealed &&
        Object.isFrozen &&
        Object.isExtensible &&
        Object.getOwnPropertyDescriptor &&
        Object.defineProperty &&
        Object.defineProperties &&
        Object.seal &&
        Object.freeze &&
        Object.preventExtensions
    );
}

function isJSONSupported() {
    return 'JSON' in window && 'parse' in JSON && 'stringify' in JSON;
}

function isWorkerSupported() {
    return 'Worker' in window;
}

// IE11 only supports `Uint8ClampedArray` as of version
// [KB2929437](https://support.microsoft.com/en-us/kb/2929437)
function isUint8ClampedArraySupported() {
    return 'Uint8ClampedArray' in window;
}

var isWebGLSupportedCache = {};
function isWebGLSupportedCached(failIfMajorPerformanceCaveat) {

    if (isWebGLSupportedCache[failIfMajorPerformanceCaveat] === undefined) {
        isWebGLSupportedCache[failIfMajorPerformanceCaveat] = isWebGLSupported(failIfMajorPerformanceCaveat);
    }

    return isWebGLSupportedCache[failIfMajorPerformanceCaveat];
}

isSupported.webGLContextAttributes = {
    antialias: false,
    alpha: true,
    stencil: true,
    depth: true
};

function isWebGLSupported(failIfMajorPerformanceCaveat) {

    var canvas = document.createElement('canvas');

    var attributes = Object.create(isSupported.webGLContextAttributes);
    attributes.failIfMajorPerformanceCaveat = failIfMajorPerformanceCaveat;

    if (canvas.probablySupportsContext) {
        return (
            canvas.probablySupportsContext('webgl', attributes) ||
            canvas.probablySupportsContext('experimental-webgl', attributes)
        );

    } else if (canvas.supportsContext) {
        return (
            canvas.supportsContext('webgl', attributes) ||
            canvas.supportsContext('experimental-webgl', attributes)
        );

    } else {
        return (
            canvas.getContext('webgl', attributes) ||
            canvas.getContext('experimental-webgl', attributes)
        );
    }
}

},{}],4:[function(require,module,exports){
'use strict';
//      

/**
 * A coordinate is a column, row, zoom combination, often used
 * as the data component of a tile.
 *
 * @param {number} column
 * @param {number} row
 * @param {number} zoom
 * @private
 */
var Coordinate = function Coordinate(column    , row    , zoom    ) {
    this.column = column;
    this.row = row;
    this.zoom = zoom;
};

/**
 * Create a clone of this coordinate that can be mutated without
 * changing the original coordinate
 *
 * @returns {Coordinate} clone
 * @private
 * var coord = new Coordinate(0, 0, 0);
 * var c2 = coord.clone();
 * // since coord is cloned, modifying a property of c2 does
 * // not modify it.
 * c2.zoom = 2;
 */
Coordinate.prototype.clone = function clone () {
    return new Coordinate(this.column, this.row, this.zoom);
};

/**
 * Zoom this coordinate to a given zoom level. This returns a new
 * coordinate object, not mutating the old one.
 *
 * @param {number} zoom
 * @returns {Coordinate} zoomed coordinate
 * @private
 * @example
 * var coord = new Coordinate(0, 0, 0);
 * var c2 = coord.zoomTo(1);
 * c2 // equals new Coordinate(0, 0, 1);
 */
Coordinate.prototype.zoomTo = function zoomTo (zoom    ) { return this.clone()._zoomTo(zoom); };

/**
 * Subtract the column and row values of this coordinate from those
 * of another coordinate. The other coordinat will be zoomed to the
 * same level as `this` before the subtraction occurs
 *
 * @param {Coordinate} c other coordinate
 * @returns {Coordinate} result
 * @private
 */
Coordinate.prototype.sub = function sub (c        ) { return this.clone()._sub(c); };

Coordinate.prototype._zoomTo = function _zoomTo (zoom    ) {
    var scale = Math.pow(2, zoom - this.zoom);
    this.column *= scale;
    this.row *= scale;
    this.zoom = zoom;
    return this;
};

Coordinate.prototype._sub = function _sub (c        ) {
    c = c.zoomTo(this.zoom);
    this.column -= c.column;
    this.row -= c.row;
    return this;
};

module.exports = Coordinate;

},{}],5:[function(require,module,exports){
'use strict';

var wrap = require('../util/util').wrap;

/**
 * A `LngLat` object represents a given longitude and latitude coordinate, measured in degrees.
 *
 * Mapbox GL uses longitude, latitude coordinate order (as opposed to latitude, longitude) to match GeoJSON.
 *
 * Note that any Mapbox GL method that accepts a `LngLat` object as an argument or option
 * can also accept an `Array` of two numbers and will perform an implicit conversion.
 * This flexible type is documented as [`LngLatLike`](#LngLatLike).
 *
 * @param {number} lng Longitude, measured in degrees.
 * @param {number} lat Latitude, measured in degrees.
 * @example
 * var ll = new mapboxgl.LngLat(-73.9749, 40.7736);
 * @see [Get coordinates of the mouse pointer](https://www.mapbox.com/mapbox-gl-js/example/mouse-position/)
 * @see [Display a popup](https://www.mapbox.com/mapbox-gl-js/example/popup/)
 * @see [Highlight features within a bounding box](https://www.mapbox.com/mapbox-gl-js/example/using-box-queryrenderedfeatures/)
 * @see [Create a timeline animation](https://www.mapbox.com/mapbox-gl-js/example/timeline-animation/)
 */
var LngLat = function LngLat(lng, lat) {
    if (isNaN(lng) || isNaN(lat)) {
        throw new Error(("Invalid LngLat object: (" + lng + ", " + lat + ")"));
    }
    this.lng = +lng;
    this.lat = +lat;
    if (this.lat > 90 || this.lat < -90) {
        throw new Error('Invalid LngLat latitude value: must be between -90 and 90');
    }
};

/**
 * Returns a new `LngLat` object whose longitude is wrapped to the range (-180, 180).
 *
 * @returns {LngLat} The wrapped `LngLat` object.
 * @example
 * var ll = new mapboxgl.LngLat(286.0251, 40.7736);
 * var wrapped = ll.wrap();
 * wrapped.lng; // = -73.9749
 */
LngLat.prototype.wrap = function wrap$1 () {
    return new LngLat(wrap(this.lng, -180, 180), this.lat);
};

/**
 * Returns a new `LngLat` object wrapped to the best world to draw it provided a map `center` `LngLat`.
 *
 * When the map is close to the anti-meridian showing a point on world -1 or 1 is a better
 * choice. The heuristic used is to minimize the distance from the map center to the point.
 *
 * Only works where the `LngLat` is wrapped with `LngLat.wrap()` and `center` is within the main world map.
 *
 * @param {LngLat} center Map center within the main world.
 * @return {LngLat} The `LngLat` object in the best world to draw it for the provided map `center`.
 * @example
 * var ll = new mapboxgl.LngLat(170, 0);
 * var mapCenter = new mapboxgl.LngLat(-170, 0);
 * var snapped = ll.wrapToBestWorld(mapCenter);
 * snapped; // = { lng: -190, lat: 0 }
 */
LngLat.prototype.wrapToBestWorld = function wrapToBestWorld (center) {
    var wrapped = new LngLat(this.lng, this.lat);

    if (Math.abs(this.lng - center.lng) > 180) {
        if (center.lng < 0) {
            wrapped.lng -= 360;
        } else {
            wrapped.lng += 360;
        }
    }

    return wrapped;
};

/**
 * Returns the coordinates represented as an array of two numbers.
 *
 * @returns {Array<number>} The coordinates represeted as an array of longitude and latitude.
 * @example
 * var ll = new mapboxgl.LngLat(-73.9749, 40.7736);
 * ll.toArray(); // = [-73.9749, 40.7736]
 */
LngLat.prototype.toArray = function toArray () {
    return [this.lng, this.lat];
};

/**
 * Returns the coordinates represent as a string.
 *
 * @returns {string} The coordinates represented as a string of the format `'LngLat(lng, lat)'`.
 * @example
 * var ll = new mapboxgl.LngLat(-73.9749, 40.7736);
 * ll.toString(); // = "LngLat(-73.9749, 40.7736)"
 */
LngLat.prototype.toString = function toString () {
    return ("LngLat(" + (this.lng) + ", " + (this.lat) + ")");
};

/**
 * Converts an array of two numbers to a `LngLat` object.
 *
 * If a `LngLat` object is passed in, the function returns it unchanged.
 *
 * @param {LngLatLike} input An array of two numbers to convert, or a `LngLat` object to return.
 * @returns {LngLat} A new `LngLat` object, if a conversion occurred, or the original `LngLat` object.
 * @example
 * var arr = [-73.9749, 40.7736];
 * var ll = mapboxgl.LngLat.convert(arr);
 * ll;   // = LngLat {lng: -73.9749, lat: 40.7736}
 */
LngLat.convert = function (input) {
    if (input instanceof LngLat) {
        return input;
    } else if (input && input.hasOwnProperty('lng') && input.hasOwnProperty('lat')) {
        return new LngLat(input.lng, input.lat);
    } else if (Array.isArray(input) && input.length === 2) {
        return new LngLat(input[0], input[1]);
    } else {
        throw new Error("`LngLatLike` argument must be specified as a LngLat instance, an object {lng: <lng>, lat: <lat>}, or an array of [<lng>, <lat>]");
    }
};

module.exports = LngLat;

},{"../util/util":12}],6:[function(require,module,exports){
'use strict';

var LngLat = require('./lng_lat');

/**
 * A `LngLatBounds` object represents a geographical bounding box,
 * defined by its southwest and northeast points in longitude and latitude.
 *
 * If no arguments are provided to the constructor, a `null` bounding box is created.
 *
 * Note that any Mapbox GL method that accepts a `LngLatBounds` object as an argument or option
 * can also accept an `Array` of two [`LngLatLike`](#LngLatLike) constructs and will perform an implicit conversion.
 * This flexible type is documented as [`LngLatBoundsLike`](#LngLatBoundsLike).
 *
 * @param {LngLatLike} [sw] The southwest corner of the bounding box.
 * @param {LngLatLike} [ne] The northeast corner of the bounding box.
 * @example
 * var sw = new mapboxgl.LngLat(-73.9876, 40.7661);
 * var ne = new mapboxgl.LngLat(-73.9397, 40.8002);
 * var llb = new mapboxgl.LngLatBounds(sw, ne);
 */
var LngLatBounds = function LngLatBounds(sw, ne) {
    if (!sw) {
        return;
    } else if (ne) {
        this.setSouthWest(sw).setNorthEast(ne);
    } else if (sw.length === 4) {
        this.setSouthWest([sw[0], sw[1]]).setNorthEast([sw[2], sw[3]]);
    } else {
        this.setSouthWest(sw[0]).setNorthEast(sw[1]);
    }
};

/**
 * Set the northeast corner of the bounding box
 *
 * @param {LngLatLike} ne
 * @returns {LngLatBounds} `this`
 */
LngLatBounds.prototype.setNorthEast = function setNorthEast (ne) {
    this._ne = LngLat.convert(ne);
    return this;
};

/**
 * Set the southwest corner of the bounding box
 *
 * @param {LngLatLike} sw
 * @returns {LngLatBounds} `this`
 */
LngLatBounds.prototype.setSouthWest = function setSouthWest (sw) {
    this._sw = LngLat.convert(sw);
    return this;
};

/**
 * Extend the bounds to include a given LngLat or LngLatBounds.
 *
 * @param {LngLat|LngLatBounds} obj object to extend to
 * @returns {LngLatBounds} `this`
 */
LngLatBounds.prototype.extend = function extend (obj) {
    var sw = this._sw,
        ne = this._ne;
    var sw2, ne2;

    if (obj instanceof LngLat) {
        sw2 = obj;
        ne2 = obj;

    } else if (obj instanceof LngLatBounds) {
        sw2 = obj._sw;
        ne2 = obj._ne;

        if (!sw2 || !ne2) { return this; }

    } else {
        if (Array.isArray(obj)) {
            if (obj.every(Array.isArray)) {
                return this.extend(LngLatBounds.convert(obj));
            } else {
                return this.extend(LngLat.convert(obj));
            }
        }
        return this;
    }

    if (!sw && !ne) {
        this._sw = new LngLat(sw2.lng, sw2.lat);
        this._ne = new LngLat(ne2.lng, ne2.lat);

    } else {
        sw.lng = Math.min(sw2.lng, sw.lng);
        sw.lat = Math.min(sw2.lat, sw.lat);
        ne.lng = Math.max(ne2.lng, ne.lng);
        ne.lat = Math.max(ne2.lat, ne.lat);
    }

    return this;
};

/**
 * Returns the geographical coordinate equidistant from the bounding box's corners.
 *
 * @returns {LngLat} The bounding box's center.
 * @example
 * var llb = new mapboxgl.LngLatBounds([-73.9876, 40.7661], [-73.9397, 40.8002]);
 * llb.getCenter(); // = LngLat {lng: -73.96365, lat: 40.78315}
 */
LngLatBounds.prototype.getCenter = function getCenter () {
    return new LngLat((this._sw.lng + this._ne.lng) / 2, (this._sw.lat + this._ne.lat) / 2);
};

/**
 * Returns the southwest corner of the bounding box.
 *
 * @returns {LngLat} The southwest corner of the bounding box.
 */
LngLatBounds.prototype.getSouthWest = function getSouthWest () { return this._sw; };

/**
* Returns the northeast corner of the bounding box.
*
* @returns {LngLat} The northeast corner of the bounding box.
 */
LngLatBounds.prototype.getNorthEast = function getNorthEast () { return this._ne; };

/**
* Returns the northwest corner of the bounding box.
*
* @returns {LngLat} The northwest corner of the bounding box.
 */
LngLatBounds.prototype.getNorthWest = function getNorthWest () { return new LngLat(this.getWest(), this.getNorth()); };

/**
* Returns the southeast corner of the bounding box.
*
* @returns {LngLat} The southeast corner of the bounding box.
 */
LngLatBounds.prototype.getSouthEast = function getSouthEast () { return new LngLat(this.getEast(), this.getSouth()); };

/**
* Returns the west edge of the bounding box.
*
* @returns {number} The west edge of the bounding box.
 */
LngLatBounds.prototype.getWest = function getWest () { return this._sw.lng; };

/**
* Returns the south edge of the bounding box.
*
* @returns {number} The south edge of the bounding box.
 */
LngLatBounds.prototype.getSouth = function getSouth () { return this._sw.lat; };

/**
* Returns the east edge of the bounding box.
*
* @returns {number} The east edge of the bounding box.
 */
LngLatBounds.prototype.getEast = function getEast () { return this._ne.lng; };

/**
* Returns the north edge of the bounding box.
*
* @returns {number} The north edge of the bounding box.
 */
LngLatBounds.prototype.getNorth = function getNorth () { return this._ne.lat; };

/**
 * Returns the bounding box represented as an array.
 *
 * @returns {Array<Array<number>>} The bounding box represented as an array, consisting of the
 *   southwest and northeast coordinates of the bounding represented as arrays of numbers.
 * @example
 * var llb = new mapboxgl.LngLatBounds([-73.9876, 40.7661], [-73.9397, 40.8002]);
 * llb.toArray(); // = [[-73.9876, 40.7661], [-73.9397, 40.8002]]
 */
LngLatBounds.prototype.toArray = function toArray () {
    return [this._sw.toArray(), this._ne.toArray()];
};

/**
 * Return the bounding box represented as a string.
 *
 * @returns {string} The bounding box represents as a string of the format
 *   `'LngLatBounds(LngLat(lng, lat), LngLat(lng, lat))'`.
 * @example
 * var llb = new mapboxgl.LngLatBounds([-73.9876, 40.7661], [-73.9397, 40.8002]);
 * llb.toString(); // = "LngLatBounds(LngLat(-73.9876, 40.7661), LngLat(-73.9397, 40.8002))"
 */
LngLatBounds.prototype.toString = function toString () {
    return ("LngLatBounds(" + (this._sw.toString()) + ", " + (this._ne.toString()) + ")");
};

/**
 * Converts an array to a `LngLatBounds` object.
 *
 * If a `LngLatBounds` object is passed in, the function returns it unchanged.
 *
 * Internally, the function calls `LngLat#convert` to convert arrays to `LngLat` values.
 *
 * @param {LngLatBoundsLike} input An array of two coordinates to convert, or a `LngLatBounds` object to return.
 * @returns {LngLatBounds} A new `LngLatBounds` object, if a conversion occurred, or the original `LngLatBounds` object.
 * @example
 * var arr = [[-73.9876, 40.7661], [-73.9397, 40.8002]];
 * var llb = mapboxgl.LngLatBounds.convert(arr);
 * llb;   // = LngLatBounds {_sw: LngLat {lng: -73.9876, lat: 40.7661}, _ne: LngLat {lng: -73.9397, lat: 40.8002}}
 */
LngLatBounds.convert = function (input) {
    if (!input || input instanceof LngLatBounds) { return input; }
    return new LngLatBounds(input);
};

module.exports = LngLatBounds;

},{"./lng_lat":5}],7:[function(require,module,exports){
'use strict';

var LngLatBounds = require('../geo/lng_lat_bounds');
var clamp = require('../util/util').clamp;

var TileBounds = function TileBounds(bounds, minzoom, maxzoom) {
    this.bounds = LngLatBounds.convert(bounds);
    this.minzoom = minzoom || 0;
    this.maxzoom = maxzoom || 24;
};

TileBounds.prototype.contains = function contains (coord, maxzoom) {
    // TileCoord returns incorrect z for overscaled tiles, so we use this
    // to make sure overzoomed tiles still get displayed.
    var tileZ = maxzoom ? Math.min(coord.z, maxzoom) : coord.z;

    var level = {
        minX: Math.floor(this.lngX(this.bounds.getWest(), tileZ)),
        minY: Math.floor(this.latY(this.bounds.getNorth(), tileZ)),
        maxX: Math.ceil(this.lngX(this.bounds.getEast(), tileZ)),
        maxY: Math.ceil(this.latY(this.bounds.getSouth(), tileZ))
    };
    var hit = coord.x >= level.minX && coord.x < level.maxX && coord.y >= level.minY && coord.y < level.maxY;
    return hit;
};

TileBounds.prototype.lngX = function lngX (lng, zoom) {
    return (lng + 180) * (Math.pow(2, zoom) / 360);
};

TileBounds.prototype.latY = function latY (lat, zoom) {
    var f = clamp(Math.sin(Math.PI / 180 * lat), -0.9999, 0.9999);
    var scale = Math.pow(2, zoom) / (2 * Math.PI);
    return Math.pow(2, zoom - 1) + 0.5 * Math.log((1 + f) / (1 - f)) * -scale;
};

module.exports = TileBounds;

},{"../geo/lng_lat_bounds":6,"../util/util":12}],8:[function(require,module,exports){
'use strict';

var window = require('./window');

var AJAXError = (function (Error) {
    function AJAXError(message, status) {
        Error.call(this, message);
        this.status = status;
    }

    if ( Error ) AJAXError.__proto__ = Error;
    AJAXError.prototype = Object.create( Error && Error.prototype );
    AJAXError.prototype.constructor = AJAXError;

    return AJAXError;
}(Error));

exports.getJSON = function(url, callback) {
    var xhr = new window.XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.onerror = function(e) {
        callback(e);
    };
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
            var data;
            try {
                data = JSON.parse(xhr.response);
            } catch (err) {
                return callback(err);
            }
            callback(null, data);
        } else {
            callback(new AJAXError(xhr.statusText, xhr.status));
        }
    };
    xhr.send();
    return xhr;
};

exports.getArrayBuffer = function(url, callback) {
    var xhr = new window.XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onerror = function(e) {
        callback(e);
    };
    xhr.onload = function() {
        if (xhr.response.byteLength === 0 && xhr.status === 200) {
            return callback(new Error('http status 200 returned without content.'));
        }
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
            callback(null, {
                data: xhr.response,
                cacheControl: xhr.getResponseHeader('Cache-Control'),
                expires: xhr.getResponseHeader('Expires')
            });
        } else {
            callback(new AJAXError(xhr.statusText, xhr.status));
        }
    };
    xhr.send();
    return xhr;
};

function sameOrigin(url) {
    var a = window.document.createElement('a');
    a.href = url;
    return a.protocol === window.document.location.protocol && a.host === window.document.location.host;
}

var transparentPngUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';

exports.getImage = function(url, callback) {
    // request the image with XHR to work around caching issues
    // see https://github.com/mapbox/mapbox-gl-js/issues/1470
    return exports.getArrayBuffer(url, function (err, imgData) {
        if (err) { return callback(err); }
        var img = new window.Image();
        var URL = window.URL || window.webkitURL;
        img.onload = function () {
            callback(null, img);
            URL.revokeObjectURL(img.src);
        };
        var blob = new window.Blob([new Uint8Array(imgData.data)], { type: 'image/png' });
        img.cacheControl = imgData.cacheControl;
        img.expires = imgData.expires;
        img.src = imgData.data.byteLength ? URL.createObjectURL(blob) : transparentPngUrl;
    });
};

exports.getVideo = function(urls, callback) {
    var video = window.document.createElement('video');
    video.onloadstart = function() {
        callback(null, video);
    };
    for (var i = 0; i < urls.length; i++) {
        var s = window.document.createElement('source');
        if (!sameOrigin(urls[i])) {
            video.crossOrigin = 'Anonymous';
        }
        s.src = urls[i];
        video.appendChild(s);
    }
    return video;
};

},{"./window":10}],9:[function(require,module,exports){
'use strict';

/**
 * @module browser
 * @private
 */

var window = require('./window');

/**
 * Provides a function that outputs milliseconds: either performance.now()
 * or a fallback to Date.now()
 */
module.exports.now = (function() {
    if (window.performance &&
        window.performance.now) {
        return window.performance.now.bind(window.performance);
    } else {
        return Date.now.bind(Date);
    }
}());

var frame = window.requestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.msRequestAnimationFrame;

exports.frame = function(fn) {
    return frame(fn);
};

var cancel = window.cancelAnimationFrame ||
    window.mozCancelAnimationFrame ||
    window.webkitCancelAnimationFrame ||
    window.msCancelAnimationFrame;

exports.cancelFrame = function(id) {
    cancel(id);
};

exports.timed = function (fn, dur, ctx) {
    if (!dur) {
        fn.call(ctx, 1);
        return null;
    }

    var abort = false;
    var start = module.exports.now();

    function tick(now) {
        if (abort) { return; }
        now = module.exports.now();

        if (now >= start + dur) {
            fn.call(ctx, 1);
        } else {
            fn.call(ctx, (now - start) / dur);
            exports.frame(tick);
        }
    }

    exports.frame(tick);

    return function() { abort = true; };
};

exports.getImageData = function (img) {
    var canvas = window.document.createElement('canvas');
    var context = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    context.drawImage(img, 0, 0, img.width, img.height);
    return context.getImageData(0, 0, img.width, img.height).data;
};

/**
 * Test if the current browser supports Mapbox GL JS
 * @param {Object} options
 * @param {boolean} [options.failIfMajorPerformanceCaveat=false] Return `false`
 *   if the performance of Mapbox GL JS would be dramatically worse than
 *   expected (i.e. a software renderer would be used)
 * @return {boolean}
 */
exports.supported = require('mapbox-gl-supported');

exports.hardwareConcurrency = window.navigator.hardwareConcurrency || 4;

Object.defineProperty(exports, 'devicePixelRatio', {
    get: function() { return window.devicePixelRatio; }
});

exports.supportsWebp = false;

var webpImgTest = window.document.createElement('img');
webpImgTest.onload = function() {
    exports.supportsWebp = true;
};
webpImgTest.src = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAQAAAAfQ//73v/+BiOh/AAA=';

},{"./window":10,"mapbox-gl-supported":3}],10:[function(require,module,exports){
'use strict';

/* eslint-env browser */
module.exports = self;

},{}],11:[function(require,module,exports){
'use strict';

var util = require('./util');

function _addEventListener(type, listener, listenerList) {
    listenerList[type] = listenerList[type] || [];
    listenerList[type].push(listener);
}

function _removeEventListener(type, listener, listenerList) {
    if (listenerList && listenerList[type]) {
        var index = listenerList[type].indexOf(listener);
        if (index !== -1) {
            listenerList[type].splice(index, 1);
        }
    }
}

/**
 * Methods mixed in to other classes for event capabilities.
 *
 * @mixin Evented
 */
var Evented = function Evented () {};

Evented.prototype.on = function on (type, listener) {
    this._listeners = this._listeners || {};
    _addEventListener(type, listener, this._listeners);

    return this;
};

/**
 * Removes a previously registered event listener.
 *
 * @param {string} type The event type to remove listeners for.
 * @param {Function} listener The listener function to remove.
 * @returns {Object} `this`
 */
Evented.prototype.off = function off (type, listener) {
    _removeEventListener(type, listener, this._listeners);
    _removeEventListener(type, listener, this._oneTimeListeners);

    return this;
};

/**
 * Adds a listener that will be called only once to a specified event type.
 *
 * The listener will be called first time the event fires after the listener is registered.
 *
 * @param {string} type The event type to listen for.
 * @param {Function} listener The function to be called when the event is fired the first time.
 * @returns {Object} `this`
 */
Evented.prototype.once = function once (type, listener) {
    this._oneTimeListeners = this._oneTimeListeners || {};
    _addEventListener(type, listener, this._oneTimeListeners);

    return this;
};

/**
 * Fires an event of the specified type.
 *
 * @param {string} type The type of event to fire.
 * @param {Object} [data] Data to be passed to any listeners.
 * @returns {Object} `this`
 */
Evented.prototype.fire = function fire (type, data) {
        var this$1 = this;

    if (this.listens(type)) {
        data = util.extend({}, data, {type: type, target: this});

        // make sure adding or removing listeners inside other listeners won't cause an infinite loop
        var listeners = this._listeners && this._listeners[type] ? this._listeners[type].slice() : [];

        for (var i = 0; i < listeners.length; i++) {
            listeners[i].call(this$1, data);
        }

        var oneTimeListeners = this._oneTimeListeners && this._oneTimeListeners[type] ? this._oneTimeListeners[type].slice() : [];

        for (var i$1 = 0; i$1 < oneTimeListeners.length; i$1++) {
            oneTimeListeners[i$1].call(this$1, data);
            _removeEventListener(type, oneTimeListeners[i$1], this$1._oneTimeListeners);
        }

        if (this._eventedParent) {
            this._eventedParent.fire(type, util.extend({}, data, typeof this._eventedParentData === 'function' ? this._eventedParentData() : this._eventedParentData));
        }

    // To ensure that no error events are dropped, print them to the
    // console if they have no listeners.
    } else if (util.endsWith(type, 'error')) {
        console.error((data && data.error) || data || 'Empty error event');
    }

    return this;
};

/**
 * Returns a true if this instance of Evented or any forwardeed instances of Evented have a listener for the specified type.
 *
 * @param {string} type The event type
 * @returns {boolean} `true` if there is at least one registered listener for specified event type, `false` otherwise
 */
Evented.prototype.listens = function listens (type) {
    return (
        (this._listeners && this._listeners[type] && this._listeners[type].length > 0) ||
        (this._oneTimeListeners && this._oneTimeListeners[type] && this._oneTimeListeners[type].length > 0) ||
        (this._eventedParent && this._eventedParent.listens(type))
    );
};

/**
 * Bubble all events fired by this instance of Evented to this parent instance of Evented.
 *
 * @private
 * @param {parent}
 * @param {data}
 * @returns {Object} `this`
 */
Evented.prototype.setEventedParent = function setEventedParent (parent, data) {
    this._eventedParent = parent;
    this._eventedParentData = data;

    return this;
};

module.exports = Evented;

},{"./util":12}],12:[function(require,module,exports){
'use strict';
//      

var UnitBezier = require('@mapbox/unitbezier');
var Coordinate = require('../geo/coordinate');
var Point = require('point-geometry');

/**
 * Given a value `t` that varies between 0 and 1, return
 * an interpolation function that eases between 0 and 1 in a pleasing
 * cubic in-out fashion.
 *
 * @private
 */
exports.easeCubicInOut = function(t        )         {
    if (t <= 0) { return 0; }
    if (t >= 1) { return 1; }
    var t2 = t * t,
        t3 = t2 * t;
    return 4 * (t < 0.5 ? t3 : 3 * (t - t2) + t3 - 0.75);
};

/**
 * Given given (x, y), (x1, y1) control points for a bezier curve,
 * return a function that interpolates along that curve.
 *
 * @param p1x control point 1 x coordinate
 * @param p1y control point 1 y coordinate
 * @param p2x control point 2 x coordinate
 * @param p2y control point 2 y coordinate
 * @private
 */
exports.bezier = function(p1x        , p1y        , p2x        , p2y        )                        {
    var bezier = new UnitBezier(p1x, p1y, p2x, p2y);
    return function(t        ) {
        return bezier.solve(t);
    };
};

/**
 * A default bezier-curve powered easing function with
 * control points (0.25, 0.1) and (0.25, 1)
 *
 * @private
 */
exports.ease = exports.bezier(0.25, 0.1, 0.25, 1);

/**
 * constrain n to the given range via min + max
 *
 * @param n value
 * @param min the minimum value to be returned
 * @param max the maximum value to be returned
 * @returns the clamped value
 * @private
 */
exports.clamp = function (n        , min        , max        )         {
    return Math.min(max, Math.max(min, n));
};

/**
 * constrain n to the given range, excluding the minimum, via modular arithmetic
 *
 * @param n value
 * @param min the minimum value to be returned, exclusive
 * @param max the maximum value to be returned, inclusive
 * @returns constrained number
 * @private
 */
exports.wrap = function (n        , min        , max        )         {
    var d = max - min;
    var w = ((n - min) % d + d) % d + min;
    return (w === min) ? max : w;
};

/*
 * Call an asynchronous function on an array of arguments,
 * calling `callback` with the completed results of all calls.
 *
 * @param array input to each call of the async function.
 * @param fn an async function with signature (data, callback)
 * @param callback a callback run after all async work is done.
 * called with an array, containing the results of each async call.
 * @private
 */
exports.asyncAll = function (array            , fn          , callback          ) {
    if (!array.length) { return callback(null, []); }
    var remaining = array.length;
    var results = new Array(array.length);
    var error = null;
    array.forEach(function (item, i) {
        fn(item, function (err, result) {
            if (err) { error = err; }
            results[i] = result;
            if (--remaining === 0) { callback(error, results); }
        });
    });
};

/*
 * Polyfill for Object.values. Not fully spec compliant, but we don't
 * need it to be.
 *
 * @private
 */
exports.values = function (obj        )                {
    var result = [];
    for (var k in obj) {
        result.push(obj[k]);
    }
    return result;
};

/*
 * Compute the difference between the keys in one object and the keys
 * in another object.
 *
 * @returns keys difference
 * @private
 */
exports.keysDifference = function (obj        , other        )                {
    var difference = [];
    for (var i in obj) {
        if (!(i in other)) {
            difference.push(i);
        }
    }
    return difference;
};

/**
 * Given a destination object and optionally many source objects,
 * copy all properties from the source objects into the destination.
 * The last source object given overrides properties from previous
 * source objects.
 *
 * @param dest destination object
 * @param {...Object} sources sources from which properties are pulled
 * @private
 */
// eslint-disable-next-line no-unused-vars
exports.extend = function (dest        , source0        , source1         , source2         )         {
    var arguments$1 = arguments;

    for (var i = 1; i < arguments.length; i++) {
        var src = arguments$1[i];
        for (var k in src) {
            dest[k] = src[k];
        }
    }
    return dest;
};

/**
 * Given an object and a number of properties as strings, return version
 * of that object with only those properties.
 *
 * @param src the object
 * @param properties an array of property names chosen
 * to appear on the resulting object.
 * @returns object with limited properties.
 * @example
 * var foo = { name: 'Charlie', age: 10 };
 * var justName = pick(foo, ['name']);
 * // justName = { name: 'Charlie' }
 * @private
 */
exports.pick = function (src        , properties               )         {
    var result = {};
    for (var i = 0; i < properties.length; i++) {
        var k = properties[i];
        if (k in src) {
            result[k] = src[k];
        }
    }
    return result;
};

var id = 1;

/**
 * Return a unique numeric id, starting at 1 and incrementing with
 * each call.
 *
 * @returns unique numeric id.
 * @private
 */
exports.uniqueId = function ()         {
    return id++;
};

/**
 * Given an array of member function names as strings, replace all of them
 * with bound versions that will always refer to `context` as `this`. This
 * is useful for classes where otherwise event bindings would reassign
 * `this` to the evented object or some other value: this lets you ensure
 * the `this` value always.
 *
 * @param fns list of member function names
 * @param context the context value
 * @example
 * function MyClass() {
 *   bindAll(['ontimer'], this);
 *   this.name = 'Tom';
 * }
 * MyClass.prototype.ontimer = function() {
 *   alert(this.name);
 * };
 * var myClass = new MyClass();
 * setTimeout(myClass.ontimer, 100);
 * @private
 */
exports.bindAll = function(fns               , context        )       {
    fns.forEach(function (fn) {
        if (!context[fn]) { return; }
        context[fn] = context[fn].bind(context);
    });
};

/**
 * Given a list of coordinates, get their center as a coordinate.
 *
 * @returns centerpoint
 * @private
 */
exports.getCoordinatesCenter = function(coords                   )             {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;

    for (var i = 0; i < coords.length; i++) {
        minX = Math.min(minX, coords[i].column);
        minY = Math.min(minY, coords[i].row);
        maxX = Math.max(maxX, coords[i].column);
        maxY = Math.max(maxY, coords[i].row);
    }

    var dx = maxX - minX;
    var dy = maxY - minY;
    var dMax = Math.max(dx, dy);
    var zoom = Math.max(0, Math.floor(-Math.log(dMax) / Math.LN2));
    return new Coordinate((minX + maxX) / 2, (minY + maxY) / 2, 0)
        .zoomTo(zoom);
};

/**
 * Determine if a string ends with a particular substring
 *
 * @private
 */
exports.endsWith = function(string        , suffix        )          {
    return string.indexOf(suffix, string.length - suffix.length) !== -1;
};

/**
 * Create an object by mapping all the values of an existing object while
 * preserving their keys.
 *
 * @private
 */
exports.mapObject = function(input        , iterator          , context         )         {
    var this$1 = this;

    var output = {};
    for (var key in input) {
        output[key] = iterator.call(context || this$1, input[key], key, input);
    }
    return output;
};

/**
 * Create an object by filtering out values of an existing object.
 *
 * @private
 */
exports.filterObject = function(input        , iterator          , context         )         {
    var this$1 = this;

    var output = {};
    for (var key in input) {
        if (iterator.call(context || this$1, input[key], key, input)) {
            output[key] = input[key];
        }
    }
    return output;
};

/**
 * Deeply compares two object literals.
 *
 * @private
 */
exports.deepEqual = function(a        , b        )          {
    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) { return false; }
        for (var i = 0; i < a.length; i++) {
            if (!exports.deepEqual(a[i], b[i])) { return false; }
        }
        return true;
    }
    if (typeof a === 'object' && a !== null && b !== null) {
        if (!(typeof b === 'object')) { return false; }
        var keys = Object.keys(a);
        if (keys.length !== Object.keys(b).length) { return false; }
        for (var key in a) {
            if (!exports.deepEqual(a[key], b[key])) { return false; }
        }
        return true;
    }
    return a === b;
};

/**
 * Deeply clones two objects.
 *
 * @private
 */
exports.clone = function   (input   )    {
    if (Array.isArray(input)) {
        return input.map(exports.clone);
    } else if (typeof input === 'object' && input) {
        return ((exports.mapObject(input, exports.clone)     )   );
    } else {
        return input;
    }
};

/**
 * Check if two arrays have at least one common element.
 *
 * @private
 */
exports.arraysIntersect = function(a            , b            )          {
    for (var l = 0; l < a.length; l++) {
        if (b.indexOf(a[l]) >= 0) { return true; }
    }
    return false;
};

/**
 * Print a warning message to the console and ensure duplicate warning messages
 * are not printed.
 *
 * @private
 */
var warnOnceHistory = {};
exports.warnOnce = function(message        )       {
    if (!warnOnceHistory[message]) {
        // console isn't defined in some WebWorkers, see #2558
        if (typeof console !== "undefined") { console.warn(message); }
        warnOnceHistory[message] = true;
    }
};

/**
 * Indicates if the provided Points are in a counter clockwise (true) or clockwise (false) order
 *
 * @returns true for a counter clockwise set of points
 */
// http://bryceboe.com/2006/10/23/line-segment-intersection-algorithm/
exports.isCounterClockwise = function(a       , b       , c       )          {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
};

/**
 * Returns the signed area for the polygon ring.  Postive areas are exterior rings and
 * have a clockwise winding.  Negative areas are interior rings and have a counter clockwise
 * ordering.
 *
 * @param ring Exterior or interior ring
 */
exports.calculateSignedArea = function(ring              )         {
    var sum = 0;
    for (var i = 0, len = ring.length, j = len - 1, p1 = (void 0), p2 = (void 0); i < len; j = i++) {
        p1 = ring[i];
        p2 = ring[j];
        sum += (p2.x - p1.x) * (p1.y + p2.y);
    }
    return sum;
};

/**
 * Detects closed polygons, first + last point are equal
 *
 * @param points array of points
 * @return true if the points are a closed polygon
 */
exports.isClosedPolygon = function(points              )          {
    // If it is 2 points that are the same then it is a point
    // If it is 3 points with start and end the same then it is a line
    if (points.length < 4)
        { return false; }

    var p1 = points[0];
    var p2 = points[points.length - 1];

    if (Math.abs(p1.x - p2.x) > 0 ||
        Math.abs(p1.y - p2.y) > 0) {
        return false;
    }

    // polygon simplification can produce polygons with zero area and more than 3 points
    return (Math.abs(exports.calculateSignedArea(points)) > 0.01);
};

/**
 * Converts spherical coordinates to cartesian coordinates.
 *
 * @param spherical Spherical coordinates, in [radial, azimuthal, polar]
 * @return cartesian coordinates in [x, y, z]
 */

exports.sphericalToCartesian = function(spherical               )                {
    var r = spherical[0];
    var azimuthal = spherical[1],
        polar = spherical[2];
    // We abstract "north"/"up" (compass-wise) to be 0° when really this is 90° (π/2):
    // correct for that here
    azimuthal += 90;

    // Convert azimuthal and polar angles to radians
    azimuthal *= Math.PI / 180;
    polar *= Math.PI / 180;

    // spherical to cartesian (x, y, z)
    return [
        r * Math.cos(azimuthal) * Math.sin(polar),
        r * Math.sin(azimuthal) * Math.sin(polar),
        r * Math.cos(polar)
    ];
};

/**
 * Parses data from 'Cache-Control' headers.
 *
 * @param cacheControl Value of 'Cache-Control' header
 * @return object containing parsed header info.
 */

exports.parseCacheControl = function(cacheControl        )         {
    // Taken from [Wreck](https://github.com/hapijs/wreck)
    var re = /(?:^|(?:\s*\,\s*))([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)(?:\=(?:([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)|(?:\"((?:[^"\\]|\\.)*)\")))?/g;

    var header = {};
    cacheControl.replace(re, function ($0, $1, $2, $3) {
        var value = $2 || $3;
        header[$1] = value ? value.toLowerCase() : true;
        return '';
    });

    if (header['max-age']) {
        var maxAge = parseInt(header['max-age'], 10);
        if (isNaN(maxAge)) { delete header['max-age']; }
        else { header['max-age'] = maxAge; }
    }

    return header;
};

},{"../geo/coordinate":4,"@mapbox/unitbezier":2,"point-geometry":13}],13:[function(require,module,exports){
'use strict';

module.exports = Point;

function Point(x, y) {
    this.x = x;
    this.y = y;
}

Point.prototype = {
    clone: function() { return new Point(this.x, this.y); },

    add:     function(p) { return this.clone()._add(p);     },
    sub:     function(p) { return this.clone()._sub(p);     },
    mult:    function(k) { return this.clone()._mult(k);    },
    div:     function(k) { return this.clone()._div(k);     },
    rotate:  function(a) { return this.clone()._rotate(a);  },
    matMult: function(m) { return this.clone()._matMult(m); },
    unit:    function() { return this.clone()._unit(); },
    perp:    function() { return this.clone()._perp(); },
    round:   function() { return this.clone()._round(); },

    mag: function() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    },

    equals: function(p) {
        return this.x === p.x &&
               this.y === p.y;
    },

    dist: function(p) {
        return Math.sqrt(this.distSqr(p));
    },

    distSqr: function(p) {
        var dx = p.x - this.x,
            dy = p.y - this.y;
        return dx * dx + dy * dy;
    },

    angle: function() {
        return Math.atan2(this.y, this.x);
    },

    angleTo: function(b) {
        return Math.atan2(this.y - b.y, this.x - b.x);
    },

    angleWith: function(b) {
        return this.angleWithSep(b.x, b.y);
    },

    // Find the angle of the two vectors, solving the formula for the cross product a x b = |a||b|sin(θ) for θ.
    angleWithSep: function(x, y) {
        return Math.atan2(
            this.x * y - this.y * x,
            this.x * x + this.y * y);
    },

    _matMult: function(m) {
        var x = m[0] * this.x + m[1] * this.y,
            y = m[2] * this.x + m[3] * this.y;
        this.x = x;
        this.y = y;
        return this;
    },

    _add: function(p) {
        this.x += p.x;
        this.y += p.y;
        return this;
    },

    _sub: function(p) {
        this.x -= p.x;
        this.y -= p.y;
        return this;
    },

    _mult: function(k) {
        this.x *= k;
        this.y *= k;
        return this;
    },

    _div: function(k) {
        this.x /= k;
        this.y /= k;
        return this;
    },

    _unit: function() {
        this._div(this.mag());
        return this;
    },

    _perp: function() {
        var y = this.y;
        this.y = this.x;
        this.x = -y;
        return this;
    },

    _rotate: function(angle) {
        var cos = Math.cos(angle),
            sin = Math.sin(angle),
            x = cos * this.x - sin * this.y,
            y = sin * this.x + cos * this.y;
        this.x = x;
        this.y = y;
        return this;
    },

    _round: function() {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        return this;
    }
};

// constructs Point from an array if necessary
Point.convert = function (a) {
    if (a instanceof Point) {
        return a;
    }
    if (Array.isArray(a)) {
        return new Point(a[0], a[1]);
    }
    return a;
};

},{}],14:[function(require,module,exports){
'use strict';

var util = require('mapbox-gl/src/util/util');
var ajax = require('mapbox-gl/src/util/ajax');
var Evented = require('mapbox-gl/src/util/evented');
var loadArcGISMapServer = require('./load_arcgis_mapserver');
var TileBounds = require('mapbox-gl/src/source/tile_bounds');

//From https://github.com/Leaflet/Leaflet/blob/master/src/core/Util.js
var _templateRe = /\{ *([\w_]+) *\}/g;
var _template = function (str, data) {
    return str.replace(_templateRe, function (str, key) {
        var value = data[key];

        if (value === undefined) {
            throw new Error(("No value provided for variable " + str));

        } else if (typeof value === 'function') {
            value = value(data);
        }
        return value;
    });
};

//From https://github.com/Leaflet/Leaflet/blob/master/src/layer/tile/TileLayer.js
var _getSubdomain = function (tilePoint, subdomains) {
    if (subdomains) {
        var index = Math.abs(tilePoint.x + tilePoint.y) % subdomains.length;
        return subdomains[index];
    }
    return null;
};

var ArcGISTiledMapServiceSource = (function (Evented) {
    function ArcGISTiledMapServiceSource(id, options, dispatcher, eventedParent) {
        Evented.call(this);
        this.id = id;
        this.dispatcher = dispatcher;
        this.setEventedParent(eventedParent);

        this.type = 'arcgisraster';
        this.minzoom = 0;
        this.maxzoom = 22;
        this.roundZoom = true;
        this.tileSize = 512;
        this._loaded = false;
        this.options = options;
        util.extend(this, util.pick(options, ['url', 'scheme', 'tileSize']));
    }

    if ( Evented ) ArcGISTiledMapServiceSource.__proto__ = Evented;
    ArcGISTiledMapServiceSource.prototype = Object.create( Evented && Evented.prototype );
    ArcGISTiledMapServiceSource.prototype.constructor = ArcGISTiledMapServiceSource;

    ArcGISTiledMapServiceSource.prototype.load = function load () {
        var this$1 = this;

        this.fire('dataloading', {dataType: 'source'});
        loadArcGISMapServer(this.options, function (err, metadata) {
            if (err) {
                return this$1.fire('error', err);
            }
            util.extend(this$1, metadata);
            this$1.setBounds(metadata.bounds);

            // `content` is included here to prevent a race condition where `Style#_updateSources` is called
            // before the TileJSON arrives. this makes sure the tiles needed are loaded once TileJSON arrives
            // ref: https://github.com/mapbox/mapbox-gl-js/pull/4347#discussion_r104418088
            this$1.fire('data', {dataType: 'source', sourceDataType: 'metadata'});
            this$1.fire('data', {dataType: 'source', sourceDataType: 'content'});

        });
    };

    ArcGISTiledMapServiceSource.prototype.onAdd = function onAdd (map) {
        // set the urls
        var baseUrl = this.url.split('?')[0];
        this.tileUrl = baseUrl + "/tile/{z}/{y}/{x}";

        var arcgisonline = new RegExp(/tiles.arcgis(online)?\.com/g);
        if (arcgisonline.test(this.url)) {
            this.tileUrl = this.tileUrl.replace('://tiles', '://tiles{s}');
            this.subdomains = ['1', '2', '3', '4'];
        }

        if (this.token) {
            this.tileUrl += (("?token=" + (this.token)));
        }
        this.load();
        this.map = map;
    };

    ArcGISTiledMapServiceSource.prototype.setBounds = function setBounds (bounds) {
        this.bounds = bounds;
        if (bounds) {
            this.tileBounds = new TileBounds(bounds, this.minzoom, this.maxzoom);
        }
    };

    ArcGISTiledMapServiceSource.prototype.serialize = function serialize () {
        return {
            type: 'arcgisraster',
            url: this.url,
            tileSize: this.tileSize,
            tiles: this.tiles,
            bounds: this.bounds,
        };
    };

    ArcGISTiledMapServiceSource.prototype.hasTile = function hasTile (coord) {
        return !this.tileBounds || this.tileBounds.contains(coord, this.maxzoom);
    };

    ArcGISTiledMapServiceSource.prototype.loadTile = function loadTile (tile, callback) {
        //convert to ags coords
        var tilePoint = tile.coord;
        var url =  _template(this.tileUrl, util.extend({
            s: _getSubdomain(tilePoint, this.subdomains),
            z: (this._lodMap && this._lodMap[tilePoint.z]) ? this._lodMap[tilePoint.z] : tilePoint.z, // try lod map first, then just defualt to zoom level
            x: tilePoint.x,
            y: tilePoint.y
        }, this.options));
        tile.request = ajax.getImage(url, done.bind(this));

        function done(err, img) {
            delete tile.request;

            if (tile.aborted) {
                this.state = 'unloaded';
                return callback(null);
            }

            if (err) {
                this.state = 'errored';
                return callback(err);
            }

            if (this.map._refreshExpiredTiles) { tile.setExpiryData(img); }
            delete img.cacheControl;
            delete img.expires;

            var gl = this.map.painter.gl;
            tile.texture = this.map.painter.getTileTexture(img.width);
            if (tile.texture) {
                gl.bindTexture(gl.TEXTURE_2D, tile.texture);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
            } else {
                tile.texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tile.texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

                if (this.map.painter.extTextureFilterAnisotropic) {
                    gl.texParameterf(gl.TEXTURE_2D, this.map.painter.extTextureFilterAnisotropic.TEXTURE_MAX_ANISOTROPY_EXT, this.map.painter.extTextureFilterAnisotropicMax);
                }

                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                tile.texture.size = img.width;
            }
            gl.generateMipmap(gl.TEXTURE_2D);

            tile.state = 'loaded';

            callback(null);
        }
    };

    ArcGISTiledMapServiceSource.prototype.abortTile = function abortTile (tile) {
        if (tile.request) {
            tile.request.abort();
            delete tile.request;
        }
    };

    ArcGISTiledMapServiceSource.prototype.unloadTile = function unloadTile (tile) {
        if (tile.texture) { this.map.painter.saveTileTexture(tile.texture); }
    };

    return ArcGISTiledMapServiceSource;
}(Evented));

module.exports = ArcGISTiledMapServiceSource;
},{"./load_arcgis_mapserver":16,"mapbox-gl/src/source/tile_bounds":7,"mapbox-gl/src/util/ajax":8,"mapbox-gl/src/util/evented":11,"mapbox-gl/src/util/util":12}],15:[function(require,module,exports){
var ArcGISTiledMapServiceSource = require('./arcgis_tiled_map_service_source');
module.exports = ArcGISTiledMapServiceSource;
},{"./arcgis_tiled_map_service_source":14}],16:[function(require,module,exports){
'use strict';
var util = require('mapbox-gl/src/util/util');
var ajax = require('mapbox-gl/src/util/ajax');
var browser = require('mapbox-gl/src/util/browser');
var SphericalMercator = require('@mapbox/sphericalmercator');

//Contains code from esri-leaflet https://github.com/Esri/esri-leaflet
var MercatorZoomLevels = {
    '0': 156543.03392799999,
    '1': 78271.516963999893,
    '2': 39135.758482000099,
    '3': 19567.879240999901,
    '4': 9783.9396204999593,
    '5': 4891.9698102499797,
    '6': 2445.9849051249898,
    '7': 1222.9924525624899,
    '8': 611.49622628138002,
    '9': 305.74811314055802,
    '10': 152.874056570411,
    '11': 76.437028285073197,
    '12': 38.218514142536598,
    '13': 19.109257071268299,
    '14': 9.5546285356341496,
    '15': 4.7773142679493699,
    '16': 2.38865713397468,
    '17': 1.1943285668550501,
    '18': 0.59716428355981699,
    '19': 0.29858214164761698,
    '20': 0.14929107082381,
    '21': 0.07464553541191,
    '22': 0.0373227677059525,
    '23': 0.0186613838529763
};

var _withinPercentage = function (a, b, percentage) {
    var diff = Math.abs((a / b) - 1);
    return diff < percentage;
};

module.exports = function(options, callback) {
    var loaded = function(err, metadata) {
        if (err) {
            return callback(err);
        }

        var result = util.pick(metadata,
            ['tileInfo', 'initialExtent', 'fullExtent', 'spatialReference', 'tileServers', 'documentInfo']);

        result._lodMap = {};
        var zoomOffsetAllowance = 0.1;
        var sr = metadata.spatialReference.latestWkid || metadata.spatialReference.wkid;
        if (sr === 102100 || sr === 3857) {

            /*
            Example extent from ArcGIS REST API
            fullExtent: {
            xmin: -9144791.679226127,
            ymin: -2195190.961437726,
            xmax: -4650987.072019983,
            ymax: 1118113.110155766,
            spatialReference: {
            wkid: 102100,
            wkt: null
            }
            },
            */
            //convert ArcGIS extent to bounds
            var extent = metadata.fullExtent;
            if (extent && extent.spatialReference && extent.spatialReference.wkid ===  102100) {
                var boundsWebMercator = [extent.xmin, extent.ymin, extent.xmax, extent.ymax];
                var merc = new SphericalMercator({
                    size: 256
                });
                var boundsWGS84 = merc.convert(boundsWebMercator);
                result.bounds = boundsWGS84;
            }

            // create the zoom level data
            var arcgisLODs = metadata.tileInfo.lods;
            var correctResolutions = MercatorZoomLevels;
            result.minzoom = arcgisLODs[0].level;
            //change
            result.maxzoom = 22;
            // result.maxzoom = arcgisLODs[arcgisLODs.length - 1].level;
            for (var i = 0; i < arcgisLODs.length; i++) {
                var arcgisLOD = arcgisLODs[i];
                for (var ci in correctResolutions) {
                    var correctRes = correctResolutions[ci];

                    if (_withinPercentage(arcgisLOD.resolution, correctRes, zoomOffsetAllowance)) {
                        result._lodMap[ci] = arcgisLOD.level;
                        break;
                    }
                }
            }
        }
        //change
        //  else {
        //     callback(new Error('non-mercator spatial reference'));
        // }

        callback(null, result);
    };

    if (options.url) {
        ajax.getJSON(options.url, loaded);
    } else {
        browser.frame(loaded.bind(null, null, options));
    }
};
},{"@mapbox/sphericalmercator":1,"mapbox-gl/src/util/ajax":8,"mapbox-gl/src/util/browser":9,"mapbox-gl/src/util/util":12}]},{},[15])(15)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvQG1hcGJveC9zcGhlcmljYWxtZXJjYXRvci9zcGhlcmljYWxtZXJjYXRvci5qcyIsIm5vZGVfbW9kdWxlcy9AbWFwYm94L3VuaXRiZXppZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbWFwYm94LWdsLXN1cHBvcnRlZC9pbmRleC5qcyIsIkM6L1VzZXJzL1NoYW5lL0RvY3VtZW50cy9EZXZ3b3JrL01hcGJveCBBcmMvbWFwYm94LWdsLWFyY2dpcy10aWxlZC1tYXAtc2VydmljZS9ub2RlX21vZHVsZXMvbWFwYm94LWdsL3NyYy9nZW8vY29vcmRpbmF0ZS5qcyIsIkM6L1VzZXJzL1NoYW5lL0RvY3VtZW50cy9EZXZ3b3JrL01hcGJveCBBcmMvbWFwYm94LWdsLWFyY2dpcy10aWxlZC1tYXAtc2VydmljZS9ub2RlX21vZHVsZXMvbWFwYm94LWdsL3NyYy9nZW8vbG5nX2xhdC5qcyIsIkM6L1VzZXJzL1NoYW5lL0RvY3VtZW50cy9EZXZ3b3JrL01hcGJveCBBcmMvbWFwYm94LWdsLWFyY2dpcy10aWxlZC1tYXAtc2VydmljZS9ub2RlX21vZHVsZXMvbWFwYm94LWdsL3NyYy9nZW8vbG5nX2xhdF9ib3VuZHMuanMiLCJDOi9Vc2Vycy9TaGFuZS9Eb2N1bWVudHMvRGV2d29yay9NYXBib3ggQXJjL21hcGJveC1nbC1hcmNnaXMtdGlsZWQtbWFwLXNlcnZpY2Uvbm9kZV9tb2R1bGVzL21hcGJveC1nbC9zcmMvc291cmNlL3RpbGVfYm91bmRzLmpzIiwiQzovVXNlcnMvU2hhbmUvRG9jdW1lbnRzL0RldndvcmsvTWFwYm94IEFyYy9tYXBib3gtZ2wtYXJjZ2lzLXRpbGVkLW1hcC1zZXJ2aWNlL25vZGVfbW9kdWxlcy9tYXBib3gtZ2wvc3JjL3V0aWwvYWpheC5qcyIsIkM6L1VzZXJzL1NoYW5lL0RvY3VtZW50cy9EZXZ3b3JrL01hcGJveCBBcmMvbWFwYm94LWdsLWFyY2dpcy10aWxlZC1tYXAtc2VydmljZS9ub2RlX21vZHVsZXMvbWFwYm94LWdsL3NyYy91dGlsL2Jyb3dzZXIuanMiLCJDOi9Vc2Vycy9TaGFuZS9Eb2N1bWVudHMvRGV2d29yay9NYXBib3ggQXJjL21hcGJveC1nbC1hcmNnaXMtdGlsZWQtbWFwLXNlcnZpY2Uvbm9kZV9tb2R1bGVzL21hcGJveC1nbC9zcmMvdXRpbC9icm93c2VyL3dpbmRvdy5qcyIsIkM6L1VzZXJzL1NoYW5lL0RvY3VtZW50cy9EZXZ3b3JrL01hcGJveCBBcmMvbWFwYm94LWdsLWFyY2dpcy10aWxlZC1tYXAtc2VydmljZS9ub2RlX21vZHVsZXMvbWFwYm94LWdsL3NyYy91dGlsL2V2ZW50ZWQuanMiLCJDOi9Vc2Vycy9TaGFuZS9Eb2N1bWVudHMvRGV2d29yay9NYXBib3ggQXJjL21hcGJveC1nbC1hcmNnaXMtdGlsZWQtbWFwLXNlcnZpY2Uvbm9kZV9tb2R1bGVzL21hcGJveC1nbC9zcmMvdXRpbC91dGlsLmpzIiwibm9kZV9tb2R1bGVzL3BvaW50LWdlb21ldHJ5L2luZGV4LmpzIiwiQzovVXNlcnMvU2hhbmUvRG9jdW1lbnRzL0RldndvcmsvTWFwYm94IEFyYy9tYXBib3gtZ2wtYXJjZ2lzLXRpbGVkLW1hcC1zZXJ2aWNlL3NyYy9hcmNnaXNfdGlsZWRfbWFwX3NlcnZpY2Vfc291cmNlLmpzIiwiQzovVXNlcnMvU2hhbmUvRG9jdW1lbnRzL0RldndvcmsvTWFwYm94IEFyYy9tYXBib3gtZ2wtYXJjZ2lzLXRpbGVkLW1hcC1zZXJ2aWNlL3NyYy9pbmRleC5qcyIsIkM6L1VzZXJzL1NoYW5lL0RvY3VtZW50cy9EZXZ3b3JrL01hcGJveCBBcmMvbWFwYm94LWdsLWFyY2dpcy10aWxlZC1tYXAtc2VydmljZS9zcmMvbG9hZF9hcmNnaXNfbWFwc2VydmVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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LENBQUMsRUFBRSxFQUFFO1FBQ2hCLEFBQUksSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1QyxBQUFJLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7O0lBRWhELEFBQUksQ0FBQyxNQUFNO1FBQ1AsQUFBSSxFQUFFLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkMsQUFBSSxFQUFFLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkMsQUFBSSxFQUFFLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkMsQUFBSSxFQUFFLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDM0MsQUFBSSxDQUFDOztJQUVMLEFBQUksT0FBTyxJQUFJLENBQUM7QUFDcEIsQUFBSSxDQUFDLENBQUE7O0FBRUwsQUFBSTtDQUNILEFBQUk7Q0FDSixBQUFJO0NBQ0osQUFBSTtDQUNKLEFBQUk7Q0FDSixBQUFJO0NBQ0osQUFBSTtDQUNKLEFBQUk7QUFDTCxBQUFJLHVCQUFBLFNBQVMsc0JBQUEsR0FBRztJQUNaLEFBQUksT0FBTyxJQUFJLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxD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VSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNoQyxLQUFLLEdBQUssQ0FBQyxFQUFFLElBQUksa0JBQWtCLEVBQUU7b0JBQ2pDLEdBQUssQ0FBQyxVQUFVLEdBQUcsa0JBQWtCLENBQUMsRUFBRSxDQUFDLENBQUM7O29CQUUxQyxJQUFJLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsVUFBVSxFQUFFLG1CQUFtQixDQUFDLEVBQUU7d0JBQzFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQzt3QkFDckMsTUFBTTtxQkFDVDtpQkFDSjthQUNKO1NBQ0o7Ozs7OztRQU1ELFFBQVEsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7S0FDMUIsQ0FBQzs7SUFFRixJQUFJLE9BQU8sQ0FBQyxHQUFHLEVBQUU7UUFDYixJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7S0FDckMsTUFBTTtRQUNILE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7S0FDbkQ7Q0FDSixDQUFDIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBTcGhlcmljYWxNZXJjYXRvciA9IChmdW5jdGlvbigpe1xuXG4vLyBDbG9zdXJlcyBpbmNsdWRpbmcgY29uc3RhbnRzIGFuZCBvdGhlciBwcmVjYWxjdWxhdGVkIHZhbHVlcy5cbnZhciBjYWNoZSA9IHt9LFxuICAgIEVQU0xOID0gMS4wZS0xMCxcbiAgICBEMlIgPSBNYXRoLlBJIC8gMTgwLFxuICAgIFIyRCA9IDE4MCAvIE1hdGguUEksXG4gICAgLy8gOTAwOTEzIHByb3BlcnRpZXMuXG4gICAgQSA9IDYzNzgxMzcuMCxcbiAgICBNQVhFWFRFTlQgPSAyMDAzNzUwOC4zNDI3ODkyNDQ7XG5cblxuLy8gU3BoZXJpY2FsTWVyY2F0b3IgY29uc3RydWN0b3I6IHByZWNhY2hlcyBjYWxjdWxhdGlvbnNcbi8vIGZvciBmYXN0IHRpbGUgbG9va3Vwcy5cbmZ1bmN0aW9uIFNwaGVyaWNhbE1lcmNhdG9yKG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB0aGlzLnNpemUgPSBvcHRpb25zLnNpemUgfHwgMjU2O1xuICAgIGlmICghY2FjaGVbdGhpcy5zaXplXSkge1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuc2l6ZTtcbiAgICAgICAgdmFyIGMgPSBjYWNoZVt0aGlzLnNpemVdID0ge307XG4gICAgICAgIGMuQmMgPSBbXTtcbiAgICAgICAgYy5DYyA9IFtdO1xuICAgICAgICBjLnpjID0gW107XG4gICAgICAgIGMuQWMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgZCA9IDA7IGQgPCAzMDsgZCsrKSB7XG4gICAgICAgICAgICBjLkJjLnB1c2goc2l6ZSAvIDM2MCk7XG4gICAgICAgICAgICBjLkNjLnB1c2goc2l6ZSAvICgyICogTWF0aC5QSSkpO1xuICAgICAgICAgICAgYy56Yy5wdXNoKHNpemUgLyAyKTtcbiAgICAgICAgICAgIGMuQWMucHVzaChzaXplKTtcbiAgICAgICAgICAgIHNpemUgKj0gMjtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0aGlzLkJjID0gY2FjaGVbdGhpcy5zaXplXS5CYztcbiAgICB0aGlzLkNjID0gY2FjaGVbdGhpcy5zaXplXS5DYztcbiAgICB0aGlzLnpjID0gY2FjaGVbdGhpcy5zaXplXS56YztcbiAgICB0aGlzLkFjID0gY2FjaGVbdGhpcy5zaXplXS5BYztcbn07XG5cbi8vIENvbnZlcnQgbG9uIGxhdCB0byBzY3JlZW4gcGl4ZWwgdmFsdWVcbi8vXG4vLyAtIGBsbGAge0FycmF5fSBgW2xvbiwgbGF0XWAgYXJyYXkgb2YgZ2VvZ3JhcGhpYyBjb29yZGluYXRlcy5cbi8vIC0gYHpvb21gIHtOdW1iZXJ9IHpvb20gbGV2ZWwuXG5TcGhlcmljYWxNZXJjYXRvci5wcm90b3R5cGUucHggPSBmdW5jdGlvbihsbCwgem9vbSkge1xuICAgIHZhciBkID0gdGhpcy56Y1t6b29tXTtcbiAgICB2YXIgZiA9IE1hdGgubWluKE1hdGgubWF4KE1hdGguc2luKEQyUiAqIGxsWzFdKSwgLTAuOTk5OSksIDAuOTk5OSk7XG4gICAgdmFyIHggPSBNYXRoLnJvdW5kKGQgKyBsbFswXSAqIHRoaXMuQmNbem9vbV0pO1xuICAgIHZhciB5ID0gTWF0aC5yb3VuZChkICsgMC41ICogTWF0aC5sb2coKDEgKyBmKSAvICgxIC0gZikpICogKC10aGlzLkNjW3pvb21dKSk7XG4gICAgKHggPiB0aGlzLkFjW3pvb21dKSAmJiAoeCA9IHRoaXMuQWNbem9vbV0pO1xuICAgICh5ID4gdGhpcy5BY1t6b29tXSkgJiYgKHkgPSB0aGlzLkFjW3pvb21dKTtcbiAgICAvLyh4IDwgMCkgJiYgKHggPSAwKTtcbiAgICAvLyh5IDwgMCkgJiYgKHkgPSAwKTtcbiAgICByZXR1cm4gW3gsIHldO1xufTtcblxuLy8gQ29udmVydCBzY3JlZW4gcGl4ZWwgdmFsdWUgdG8gbG9uIGxhdFxuLy9cbi8vIC0gYHB4YCB7QXJyYXl9IGBbeCwgeV1gIGFycmF5IG9mIGdlb2dyYXBoaWMgY29vcmRpbmF0ZXMuXG4vLyAtIGB6b29tYCB7TnVtYmVyfSB6b29tIGxldmVsLlxuU3BoZXJpY2FsTWVyY2F0b3IucHJvdG90eXBlLmxsID0gZnVuY3Rpb24ocHgsIHpvb20pIHtcbiAgICB2YXIgZyA9IChweFsxXSAtIHRoaXMuemNbem9vbV0pIC8gKC10aGlzLkNjW3pvb21dKTtcbiAgICB2YXIgbG9uID0gKHB4WzBdIC0gdGhpcy56Y1t6b29tXSkgLyB0aGlzLkJjW3pvb21dO1xuICAgIHZhciBsYXQgPSBSMkQgKiAoMiAqIE1hdGguYXRhbihNYXRoLmV4cChnKSkgLSAwLjUgKiBNYXRoLlBJKTtcbiAgICByZXR1cm4gW2xvbiwgbGF0XTtcbn07XG5cbi8vIENvbnZlcnQgdGlsZSB4eXogdmFsdWUgdG8gYmJveCBvZiB0aGUgZm9ybSBgW3csIHMsIGUsIG5dYFxuLy9cbi8vIC0gYHhgIHtOdW1iZXJ9IHggKGxvbmdpdHVkZSkgbnVtYmVyLlxuLy8gLSBgeWAge051bWJlcn0geSAobGF0aXR1ZGUpIG51bWJlci5cbi8vIC0gYHpvb21gIHtOdW1iZXJ9IHpvb20uXG4vLyAtIGB0bXNfc3R5bGVgIHtCb29sZWFufSB3aGV0aGVyIHRvIGNvbXB1dGUgdXNpbmcgdG1zLXN0eWxlLlxuLy8gLSBgc3JzYCB7U3RyaW5nfSBwcm9qZWN0aW9uIGZvciByZXN1bHRpbmcgYmJveCAoV0dTODR8OTAwOTEzKS5cbi8vIC0gYHJldHVybmAge0FycmF5fSBiYm94IGFycmF5IG9mIHZhbHVlcyBpbiBmb3JtIGBbdywgcywgZSwgbl1gLlxuU3BoZXJpY2FsTWVyY2F0b3IucHJvdG90eXBlLmJib3ggPSBmdW5jdGlvbih4LCB5LCB6b29tLCB0bXNfc3R5bGUsIHNycykge1xuICAgIC8vIENvbnZlcnQgeHl6IGludG8gYmJveCB3aXRoIHNycyBXR1M4NFxuICAgIGlmICh0bXNfc3R5bGUpIHtcbiAgICAgICAgeSA9IChNYXRoLnBvdygyLCB6b29tKSAtIDEpIC0geTtcbiAgICB9XG4gICAgLy8gVXNlICt5IHRvIG1ha2Ugc3VyZSBpdCdzIGEgbnVtYmVyIHRvIGF2b2lkIGluYWR2ZXJ0ZW50IGNvbmNhdGVuYXRpb24uXG4gICAgdmFyIGxsID0gW3ggKiB0aGlzLnNpemUsICgreSArIDEpICogdGhpcy5zaXplXTsgLy8gbG93ZXIgbGVmdFxuICAgIC8vIFVzZSAreCB0byBtYWtlIHN1cmUgaXQncyBhIG51bWJlciB0byBhdm9pZCBpbmFkdmVydGVudCBjb25jYXRlbmF0aW9uLlxuICAgIHZhciB1ciA9IFsoK3ggKyAxKSAqIHRoaXMuc2l6ZSwgeSAqIHRoaXMuc2l6ZV07IC8vIHVwcGVyIHJpZ2h0XG4gICAgdmFyIGJib3ggPSB0aGlzLmxsKGxsLCB6b29tKS5jb25jYXQodGhpcy5sbCh1ciwgem9vbSkpO1xuXG4gICAgLy8gSWYgd2ViIG1lcmNhdG9yIHJlcXVlc3RlZCByZXByb2plY3QgdG8gOTAwOTEzLlxuICAgIGlmIChzcnMgPT09ICc5MDA5MTMnKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnZlcnQoYmJveCwgJzkwMDkxMycpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBiYm94O1xuICAgIH1cbn07XG5cbi8vIENvbnZlcnQgYmJveCB0byB4eXggYm91bmRzXG4vL1xuLy8gLSBgYmJveGAge051bWJlcn0gYmJveCBpbiB0aGUgZm9ybSBgW3csIHMsIGUsIG5dYC5cbi8vIC0gYHpvb21gIHtOdW1iZXJ9IHpvb20uXG4vLyAtIGB0bXNfc3R5bGVgIHtCb29sZWFufSB3aGV0aGVyIHRvIGNvbXB1dGUgdXNpbmcgdG1zLXN0eWxlLlxuLy8gLSBgc3JzYCB7U3RyaW5nfSBwcm9qZWN0aW9uIG9mIGlucHV0IGJib3ggKFdHUzg0fDkwMDkxMykuXG4vLyAtIGBAcmV0dXJuYCB7T2JqZWN0fSBYWVogYm91bmRzIGNvbnRhaW5pbmcgbWluWCwgbWF4WCwgbWluWSwgbWF4WSBwcm9wZXJ0aWVzLlxuU3BoZXJpY2FsTWVyY2F0b3IucHJvdG90eXBlLnh5eiA9IGZ1bmN0aW9uKGJib3gsIHpvb20sIHRtc19zdHlsZSwgc3JzKSB7XG4gICAgLy8gSWYgd2ViIG1lcmNhdG9yIHByb3ZpZGVkIHJlcHJvamVjdCB0byBXR1M4NC5cbiAgICBpZiAoc3JzID09PSAnOTAwOTEzJykge1xuICAgICAgICBiYm94ID0gdGhpcy5jb252ZXJ0KGJib3gsICdXR1M4NCcpO1xuICAgIH1cblxuICAgIHZhciBsbCA9IFtiYm94WzBdLCBiYm94WzFdXTsgLy8gbG93ZXIgbGVmdFxuICAgIHZhciB1ciA9IFtiYm94WzJdLCBiYm94WzNdXTsgLy8gdXBwZXIgcmlnaHRcbiAgICB2YXIgcHhfbGwgPSB0aGlzLnB4KGxsLCB6b29tKTtcbiAgICB2YXIgcHhfdXIgPSB0aGlzLnB4KHVyLCB6b29tKTtcbiAgICAvLyBZID0gMCBmb3IgWFlaIGlzIHRoZSB0b3AgaGVuY2UgbWluWSB1c2VzIHB4X3VyWzFdLlxuICAgIHZhciB4ID0gWyBNYXRoLmZsb29yKHB4X2xsWzBdIC8gdGhpcy5zaXplKSwgTWF0aC5mbG9vcigocHhfdXJbMF0gLSAxKSAvIHRoaXMuc2l6ZSkgXTtcbiAgICB2YXIgeSA9IFsgTWF0aC5mbG9vcihweF91clsxXSAvIHRoaXMuc2l6ZSksIE1hdGguZmxvb3IoKHB4X2xsWzFdIC0gMSkgLyB0aGlzLnNpemUpIF07XG4gICAgdmFyIGJvdW5kcyA9IHtcbiAgICAgICAgbWluWDogTWF0aC5taW4uYXBwbHkoTWF0aCwgeCkgPCAwID8gMCA6IE1hdGgubWluLmFwcGx5KE1hdGgsIHgpLFxuICAgICAgICBtaW5ZOiBNYXRoLm1pbi5hcHBseShNYXRoLCB5KSA8IDAgPyAwIDogTWF0aC5taW4uYXBwbHkoTWF0aCwgeSksXG4gICAgICAgIG1heFg6IE1hdGgubWF4LmFwcGx5KE1hdGgsIHgpLFxuICAgICAgICBtYXhZOiBNYXRoLm1heC5hcHBseShNYXRoLCB5KVxuICAgIH07XG4gICAgaWYgKHRtc19zdHlsZSkge1xuICAgICAgICB2YXIgdG1zID0ge1xuICAgICAgICAgICAgbWluWTogKE1hdGgucG93KDIsIHpvb20pIC0gMSkgLSBib3VuZHMubWF4WSxcbiAgICAgICAgICAgIG1heFk6IChNYXRoLnBvdygyLCB6b29tKSAtIDEpIC0gYm91bmRzLm1pbllcbiAgICAgICAgfTtcbiAgICAgICAgYm91bmRzLm1pblkgPSB0bXMubWluWTtcbiAgICAgICAgYm91bmRzLm1heFkgPSB0bXMubWF4WTtcbiAgICB9XG4gICAgcmV0dXJuIGJvdW5kcztcbn07XG5cbi8vIENvbnZlcnQgcHJvamVjdGlvbiBvZiBnaXZlbiBiYm94LlxuLy9cbi8vIC0gYGJib3hgIHtOdW1iZXJ9IGJib3ggaW4gdGhlIGZvcm0gYFt3LCBzLCBlLCBuXWAuXG4vLyAtIGB0b2Age1N0cmluZ30gcHJvamVjdGlvbiBvZiBvdXRwdXQgYmJveCAoV0dTODR8OTAwOTEzKS4gSW5wdXQgYmJveFxuLy8gICBhc3N1bWVkIHRvIGJlIHRoZSBcIm90aGVyXCIgcHJvamVjdGlvbi5cbi8vIC0gYEByZXR1cm5gIHtPYmplY3R9IGJib3ggd2l0aCByZXByb2plY3RlZCBjb29yZGluYXRlcy5cblNwaGVyaWNhbE1lcmNhdG9yLnByb3RvdHlwZS5jb252ZXJ0ID0gZnVuY3Rpb24oYmJveCwgdG8pIHtcbiAgICBpZiAodG8gPT09ICc5MDA5MTMnKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZvcndhcmQoYmJveC5zbGljZSgwLCAyKSkuY29uY2F0KHRoaXMuZm9yd2FyZChiYm94LnNsaWNlKDIsNCkpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5pbnZlcnNlKGJib3guc2xpY2UoMCwgMikpLmNvbmNhdCh0aGlzLmludmVyc2UoYmJveC5zbGljZSgyLDQpKSk7XG4gICAgfVxufTtcblxuLy8gQ29udmVydCBsb24vbGF0IHZhbHVlcyB0byA5MDA5MTMgeC95LlxuU3BoZXJpY2FsTWVyY2F0b3IucHJvdG90eXBlLmZvcndhcmQgPSBmdW5jdGlvbihsbCkge1xuICAgIHZhciB4eSA9IFtcbiAgICAgICAgQSAqIGxsWzBdICogRDJSLFxuICAgICAgICBBICogTWF0aC5sb2coTWF0aC50YW4oKE1hdGguUEkqMC4yNSkgKyAoMC41ICogbGxbMV0gKiBEMlIpKSlcbiAgICBdO1xuICAgIC8vIGlmIHh5IHZhbHVlIGlzIGJleW9uZCBtYXhleHRlbnQgKGUuZy4gcG9sZXMpLCByZXR1cm4gbWF4ZXh0ZW50LlxuICAgICh4eVswXSA+IE1BWEVYVEVOVCkgJiYgKHh5WzBdID0gTUFYRVhURU5UKTtcbiAgICAoeHlbMF0gPCAtTUFYRVhURU5UKSAmJiAoeHlbMF0gPSAtTUFYRVhURU5UKTtcbiAgICAoeHlbMV0gPiBNQVhFWFRFTlQpICYmICh4eVsxXSA9IE1BWEVYVEVOVCk7XG4gICAgKHh5WzFdIDwgLU1BWEVYVEVOVCkgJiYgKHh5WzFdID0gLU1BWEVYVEVOVCk7XG4gICAgcmV0dXJuIHh5O1xufTtcblxuLy8gQ29udmVydCA5MDA5MTMgeC95IHZhbHVlcyB0byBsb24vbGF0LlxuU3BoZXJpY2FsTWVyY2F0b3IucHJvdG90eXBlLmludmVyc2UgPSBmdW5jdGlvbih4eSkge1xuICAgIHJldHVybiBbXG4gICAgICAgICh4eVswXSAqIFIyRCAvIEEpLFxuICAgICAgICAoKE1hdGguUEkqMC41KSAtIDIuMCAqIE1hdGguYXRhbihNYXRoLmV4cCgteHlbMV0gLyBBKSkpICogUjJEXG4gICAgXTtcbn07XG5cbnJldHVybiBTcGhlcmljYWxNZXJjYXRvcjtcblxufSkoKTtcblxuaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZXhwb3J0cyA9IFNwaGVyaWNhbE1lcmNhdG9yO1xufVxuIiwiLypcbiAqIENvcHlyaWdodCAoQykgMjAwOCBBcHBsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnNcbiAqIGFyZSBtZXQ6XG4gKiAxLiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogMi4gUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBBUFBMRSBJTkMuIGBgQVMgSVMnJyBBTkQgQU5ZXG4gKiBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRVxuICogSU1QTElFRCBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSXG4gKiBQVVJQT1NFIEFSRSBESVNDTEFJTUVELiAgSU4gTk8gRVZFTlQgU0hBTEwgQVBQTEUgSU5DLiBPUlxuICogQ09OVFJJQlVUT1JTIEJFIExJQUJMRSBGT1IgQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsXG4gKiBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sXG4gKiBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTOyBMT1NTIE9GIFVTRSwgREFUQSwgT1JcbiAqIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OIEFOWSBUSEVPUllcbiAqIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFXG4gKiBPRiBUSElTIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqIFBvcnRlZCBmcm9tIFdlYmtpdFxuICogaHR0cDovL3N2bi53ZWJraXQub3JnL3JlcG9zaXRvcnkvd2Via2l0L3RydW5rL1NvdXJjZS9XZWJDb3JlL3BsYXRmb3JtL2dyYXBoaWNzL1VuaXRCZXppZXIuaFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gVW5pdEJlemllcjtcblxuZnVuY3Rpb24gVW5pdEJlemllcihwMXgsIHAxeSwgcDJ4LCBwMnkpIHtcbiAgICAvLyBDYWxjdWxhdGUgdGhlIHBvbHlub21pYWwgY29lZmZpY2llbnRzLCBpbXBsaWNpdCBmaXJzdCBhbmQgbGFzdCBjb250cm9sIHBvaW50cyBhcmUgKDAsMCkgYW5kICgxLDEpLlxuICAgIHRoaXMuY3ggPSAzLjAgKiBwMXg7XG4gICAgdGhpcy5ieCA9IDMuMCAqIChwMnggLSBwMXgpIC0gdGhpcy5jeDtcbiAgICB0aGlzLmF4ID0gMS4wIC0gdGhpcy5jeCAtIHRoaXMuYng7XG5cbiAgICB0aGlzLmN5ID0gMy4wICogcDF5O1xuICAgIHRoaXMuYnkgPSAzLjAgKiAocDJ5IC0gcDF5KSAtIHRoaXMuY3k7XG4gICAgdGhpcy5heSA9IDEuMCAtIHRoaXMuY3kgLSB0aGlzLmJ5O1xuXG4gICAgdGhpcy5wMXggPSBwMXg7XG4gICAgdGhpcy5wMXkgPSBwMnk7XG4gICAgdGhpcy5wMnggPSBwMng7XG4gICAgdGhpcy5wMnkgPSBwMnk7XG59XG5cblVuaXRCZXppZXIucHJvdG90eXBlLnNhbXBsZUN1cnZlWCA9IGZ1bmN0aW9uKHQpIHtcbiAgICAvLyBgYXggdF4zICsgYnggdF4yICsgY3ggdCcgZXhwYW5kZWQgdXNpbmcgSG9ybmVyJ3MgcnVsZS5cbiAgICByZXR1cm4gKCh0aGlzLmF4ICogdCArIHRoaXMuYngpICogdCArIHRoaXMuY3gpICogdDtcbn07XG5cblVuaXRCZXppZXIucHJvdG90eXBlLnNhbXBsZUN1cnZlWSA9IGZ1bmN0aW9uKHQpIHtcbiAgICByZXR1cm4gKCh0aGlzLmF5ICogdCArIHRoaXMuYnkpICogdCArIHRoaXMuY3kpICogdDtcbn07XG5cblVuaXRCZXppZXIucHJvdG90eXBlLnNhbXBsZUN1cnZlRGVyaXZhdGl2ZVggPSBmdW5jdGlvbih0KSB7XG4gICAgcmV0dXJuICgzLjAgKiB0aGlzLmF4ICogdCArIDIuMCAqIHRoaXMuYngpICogdCArIHRoaXMuY3g7XG59O1xuXG5Vbml0QmV6aWVyLnByb3RvdHlwZS5zb2x2ZUN1cnZlWCA9IGZ1bmN0aW9uKHgsIGVwc2lsb24pIHtcbiAgICBpZiAodHlwZW9mIGVwc2lsb24gPT09ICd1bmRlZmluZWQnKSBlcHNpbG9uID0gMWUtNjtcblxuICAgIHZhciB0MCwgdDEsIHQyLCB4MiwgaTtcblxuICAgIC8vIEZpcnN0IHRyeSBhIGZldyBpdGVyYXRpb25zIG9mIE5ld3RvbidzIG1ldGhvZCAtLSBub3JtYWxseSB2ZXJ5IGZhc3QuXG4gICAgZm9yICh0MiA9IHgsIGkgPSAwOyBpIDwgODsgaSsrKSB7XG5cbiAgICAgICAgeDIgPSB0aGlzLnNhbXBsZUN1cnZlWCh0MikgLSB4O1xuICAgICAgICBpZiAoTWF0aC5hYnMoeDIpIDwgZXBzaWxvbikgcmV0dXJuIHQyO1xuXG4gICAgICAgIHZhciBkMiA9IHRoaXMuc2FtcGxlQ3VydmVEZXJpdmF0aXZlWCh0Mik7XG4gICAgICAgIGlmIChNYXRoLmFicyhkMikgPCAxZS02KSBicmVhaztcblxuICAgICAgICB0MiA9IHQyIC0geDIgLyBkMjtcbiAgICB9XG5cbiAgICAvLyBGYWxsIGJhY2sgdG8gdGhlIGJpc2VjdGlvbiBtZXRob2QgZm9yIHJlbGlhYmlsaXR5LlxuICAgIHQwID0gMC4wO1xuICAgIHQxID0gMS4wO1xuICAgIHQyID0geDtcblxuICAgIGlmICh0MiA8IHQwKSByZXR1cm4gdDA7XG4gICAgaWYgKHQyID4gdDEpIHJldHVybiB0MTtcblxuICAgIHdoaWxlICh0MCA8IHQxKSB7XG5cbiAgICAgICAgeDIgPSB0aGlzLnNhbXBsZUN1cnZlWCh0Mik7XG4gICAgICAgIGlmIChNYXRoLmFicyh4MiAtIHgpIDwgZXBzaWxvbikgcmV0dXJuIHQyO1xuXG4gICAgICAgIGlmICh4ID4geDIpIHtcbiAgICAgICAgICAgIHQwID0gdDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0MSA9IHQyO1xuICAgICAgICB9XG5cbiAgICAgICAgdDIgPSAodDEgLSB0MCkgKiAwLjUgKyB0MDtcbiAgICB9XG5cbiAgICAvLyBGYWlsdXJlLlxuICAgIHJldHVybiB0Mjtcbn07XG5cblVuaXRCZXppZXIucHJvdG90eXBlLnNvbHZlID0gZnVuY3Rpb24oeCwgZXBzaWxvbikge1xuICAgIHJldHVybiB0aGlzLnNhbXBsZUN1cnZlWSh0aGlzLnNvbHZlQ3VydmVYKHgsIGVwc2lsb24pKTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gaXNTdXBwb3J0ZWQ7XG59IGVsc2UgaWYgKHdpbmRvdykge1xuICAgIHdpbmRvdy5tYXBib3hnbCA9IHdpbmRvdy5tYXBib3hnbCB8fCB7fTtcbiAgICB3aW5kb3cubWFwYm94Z2wuc3VwcG9ydGVkID0gaXNTdXBwb3J0ZWQ7XG59XG5cbi8qKlxuICogVGVzdCB3aGV0aGVyIHRoZSBjdXJyZW50IGJyb3dzZXIgc3VwcG9ydHMgTWFwYm94IEdMIEpTXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5mYWlsSWZNYWpvclBlcmZvcm1hbmNlQ2F2ZWF0PWZhbHNlXSBSZXR1cm4gYGZhbHNlYFxuICogICBpZiB0aGUgcGVyZm9ybWFuY2Ugb2YgTWFwYm94IEdMIEpTIHdvdWxkIGJlIGRyYW1hdGljYWxseSB3b3JzZSB0aGFuXG4gKiAgIGV4cGVjdGVkIChpLmUuIGEgc29mdHdhcmUgcmVuZGVyZXIgaXMgd291bGQgYmUgdXNlZClcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmZ1bmN0aW9uIGlzU3VwcG9ydGVkKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gISEoXG4gICAgICAgIGlzQnJvd3NlcigpICYmXG4gICAgICAgIGlzQXJyYXlTdXBwb3J0ZWQoKSAmJlxuICAgICAgICBpc0Z1bmN0aW9uU3VwcG9ydGVkKCkgJiZcbiAgICAgICAgaXNPYmplY3RTdXBwb3J0ZWQoKSAmJlxuICAgICAgICBpc0pTT05TdXBwb3J0ZWQoKSAmJlxuICAgICAgICBpc1dvcmtlclN1cHBvcnRlZCgpICYmXG4gICAgICAgIGlzVWludDhDbGFtcGVkQXJyYXlTdXBwb3J0ZWQoKSAmJlxuICAgICAgICBpc1dlYkdMU3VwcG9ydGVkQ2FjaGVkKG9wdGlvbnMgJiYgb3B0aW9ucy5mYWlsSWZNYWpvclBlcmZvcm1hbmNlQ2F2ZWF0KVxuICAgICk7XG59XG5cbmZ1bmN0aW9uIGlzQnJvd3NlcigpIHtcbiAgICByZXR1cm4gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJztcbn1cblxuZnVuY3Rpb24gaXNBcnJheVN1cHBvcnRlZCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgICBBcnJheS5wcm90b3R5cGUgJiZcbiAgICAgICAgQXJyYXkucHJvdG90eXBlLmV2ZXJ5ICYmXG4gICAgICAgIEFycmF5LnByb3RvdHlwZS5maWx0ZXIgJiZcbiAgICAgICAgQXJyYXkucHJvdG90eXBlLmZvckVhY2ggJiZcbiAgICAgICAgQXJyYXkucHJvdG90eXBlLmluZGV4T2YgJiZcbiAgICAgICAgQXJyYXkucHJvdG90eXBlLmxhc3RJbmRleE9mICYmXG4gICAgICAgIEFycmF5LnByb3RvdHlwZS5tYXAgJiZcbiAgICAgICAgQXJyYXkucHJvdG90eXBlLnNvbWUgJiZcbiAgICAgICAgQXJyYXkucHJvdG90eXBlLnJlZHVjZSAmJlxuICAgICAgICBBcnJheS5wcm90b3R5cGUucmVkdWNlUmlnaHQgJiZcbiAgICAgICAgQXJyYXkuaXNBcnJheVxuICAgICk7XG59XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb25TdXBwb3J0ZWQoKSB7XG4gICAgcmV0dXJuIEZ1bmN0aW9uLnByb3RvdHlwZSAmJiBGdW5jdGlvbi5wcm90b3R5cGUuYmluZDtcbn1cblxuZnVuY3Rpb24gaXNPYmplY3RTdXBwb3J0ZWQoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgT2JqZWN0LmtleXMgJiZcbiAgICAgICAgT2JqZWN0LmNyZWF0ZSAmJlxuICAgICAgICBPYmplY3QuZ2V0UHJvdG90eXBlT2YgJiZcbiAgICAgICAgT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMgJiZcbiAgICAgICAgT2JqZWN0LmlzU2VhbGVkICYmXG4gICAgICAgIE9iamVjdC5pc0Zyb3plbiAmJlxuICAgICAgICBPYmplY3QuaXNFeHRlbnNpYmxlICYmXG4gICAgICAgIE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IgJiZcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5ICYmXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzICYmXG4gICAgICAgIE9iamVjdC5zZWFsICYmXG4gICAgICAgIE9iamVjdC5mcmVlemUgJiZcbiAgICAgICAgT2JqZWN0LnByZXZlbnRFeHRlbnNpb25zXG4gICAgKTtcbn1cblxuZnVuY3Rpb24gaXNKU09OU3VwcG9ydGVkKCkge1xuICAgIHJldHVybiAnSlNPTicgaW4gd2luZG93ICYmICdwYXJzZScgaW4gSlNPTiAmJiAnc3RyaW5naWZ5JyBpbiBKU09OO1xufVxuXG5mdW5jdGlvbiBpc1dvcmtlclN1cHBvcnRlZCgpIHtcbiAgICByZXR1cm4gJ1dvcmtlcicgaW4gd2luZG93O1xufVxuXG4vLyBJRTExIG9ubHkgc3VwcG9ydHMgYFVpbnQ4Q2xhbXBlZEFycmF5YCBhcyBvZiB2ZXJzaW9uXG4vLyBbS0IyOTI5NDM3XShodHRwczovL3N1cHBvcnQubWljcm9zb2Z0LmNvbS9lbi11cy9rYi8yOTI5NDM3KVxuZnVuY3Rpb24gaXNVaW50OENsYW1wZWRBcnJheVN1cHBvcnRlZCgpIHtcbiAgICByZXR1cm4gJ1VpbnQ4Q2xhbXBlZEFycmF5JyBpbiB3aW5kb3c7XG59XG5cbnZhciBpc1dlYkdMU3VwcG9ydGVkQ2FjaGUgPSB7fTtcbmZ1bmN0aW9uIGlzV2ViR0xTdXBwb3J0ZWRDYWNoZWQoZmFpbElmTWFqb3JQZXJmb3JtYW5jZUNhdmVhdCkge1xuXG4gICAgaWYgKGlzV2ViR0xTdXBwb3J0ZWRDYWNoZVtmYWlsSWZNYWpvclBlcmZvcm1hbmNlQ2F2ZWF0XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlzV2ViR0xTdXBwb3J0ZWRDYWNoZVtmYWlsSWZNYWpvclBlcmZvcm1hbmNlQ2F2ZWF0XSA9IGlzV2ViR0xTdXBwb3J0ZWQoZmFpbElmTWFqb3JQZXJmb3JtYW5jZUNhdmVhdCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGlzV2ViR0xTdXBwb3J0ZWRDYWNoZVtmYWlsSWZNYWpvclBlcmZvcm1hbmNlQ2F2ZWF0XTtcbn1cblxuaXNTdXBwb3J0ZWQud2ViR0xDb250ZXh0QXR0cmlidXRlcyA9IHtcbiAgICBhbnRpYWxpYXM6IGZhbHNlLFxuICAgIGFscGhhOiB0cnVlLFxuICAgIHN0ZW5jaWw6IHRydWUsXG4gICAgZGVwdGg6IHRydWVcbn07XG5cbmZ1bmN0aW9uIGlzV2ViR0xTdXBwb3J0ZWQoZmFpbElmTWFqb3JQZXJmb3JtYW5jZUNhdmVhdCkge1xuXG4gICAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBPYmplY3QuY3JlYXRlKGlzU3VwcG9ydGVkLndlYkdMQ29udGV4dEF0dHJpYnV0ZXMpO1xuICAgIGF0dHJpYnV0ZXMuZmFpbElmTWFqb3JQZXJmb3JtYW5jZUNhdmVhdCA9IGZhaWxJZk1ham9yUGVyZm9ybWFuY2VDYXZlYXQ7XG5cbiAgICBpZiAoY2FudmFzLnByb2JhYmx5U3VwcG9ydHNDb250ZXh0KSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICBjYW52YXMucHJvYmFibHlTdXBwb3J0c0NvbnRleHQoJ3dlYmdsJywgYXR0cmlidXRlcykgfHxcbiAgICAgICAgICAgIGNhbnZhcy5wcm9iYWJseVN1cHBvcnRzQ29udGV4dCgnZXhwZXJpbWVudGFsLXdlYmdsJywgYXR0cmlidXRlcylcbiAgICAgICAgKTtcblxuICAgIH0gZWxzZSBpZiAoY2FudmFzLnN1cHBvcnRzQ29udGV4dCkge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgY2FudmFzLnN1cHBvcnRzQ29udGV4dCgnd2ViZ2wnLCBhdHRyaWJ1dGVzKSB8fFxuICAgICAgICAgICAgY2FudmFzLnN1cHBvcnRzQ29udGV4dCgnZXhwZXJpbWVudGFsLXdlYmdsJywgYXR0cmlidXRlcylcbiAgICAgICAgKTtcblxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICBjYW52YXMuZ2V0Q29udGV4dCgnd2ViZ2wnLCBhdHRyaWJ1dGVzKSB8fFxuICAgICAgICAgICAgY2FudmFzLmdldENvbnRleHQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcsIGF0dHJpYnV0ZXMpXG4gICAgICAgICk7XG4gICAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnO1xuLy8gICAgICBcblxuLyoqXG4gKiBBIGNvb3JkaW5hdGUgaXMgYSBjb2x1bW4sIHJvdywgem9vbSBjb21iaW5hdGlvbiwgb2Z0ZW4gdXNlZFxuICogYXMgdGhlIGRhdGEgY29tcG9uZW50IG9mIGEgdGlsZS5cbiAqXG4gKiBAcGFyYW0ge251bWJlcn0gY29sdW1uXG4gKiBAcGFyYW0ge251bWJlcn0gcm93XG4gKiBAcGFyYW0ge251bWJlcn0gem9vbVxuICogQHByaXZhdGVcbiAqL1xuY2xhc3MgQ29vcmRpbmF0ZSB7XG4gICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgIFxuICAgIGNvbnN0cnVjdG9yKGNvbHVtbiAgICAgICAgLCByb3cgICAgICAgICwgem9vbSAgICAgICAgKSB7XG4gICAgICAgIHRoaXMuY29sdW1uID0gY29sdW1uO1xuICAgICAgICB0aGlzLnJvdyA9IHJvdztcbiAgICAgICAgdGhpcy56b29tID0gem9vbTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBjbG9uZSBvZiB0aGlzIGNvb3JkaW5hdGUgdGhhdCBjYW4gYmUgbXV0YXRlZCB3aXRob3V0XG4gICAgICogY2hhbmdpbmcgdGhlIG9yaWdpbmFsIGNvb3JkaW5hdGVcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtDb29yZGluYXRlfSBjbG9uZVxuICAgICAqIEBwcml2YXRlXG4gICAgICogdmFyIGNvb3JkID0gbmV3IENvb3JkaW5hdGUoMCwgMCwgMCk7XG4gICAgICogdmFyIGMyID0gY29vcmQuY2xvbmUoKTtcbiAgICAgKiAvLyBzaW5jZSBjb29yZCBpcyBjbG9uZWQsIG1vZGlmeWluZyBhIHByb3BlcnR5IG9mIGMyIGRvZXNcbiAgICAgKiAvLyBub3QgbW9kaWZ5IGl0LlxuICAgICAqIGMyLnpvb20gPSAyO1xuICAgICAqL1xuICAgIGNsb25lKCkge1xuICAgICAgICByZXR1cm4gbmV3IENvb3JkaW5hdGUodGhpcy5jb2x1bW4sIHRoaXMucm93LCB0aGlzLnpvb20pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFpvb20gdGhpcyBjb29yZGluYXRlIHRvIGEgZ2l2ZW4gem9vbSBsZXZlbC4gVGhpcyByZXR1cm5zIGEgbmV3XG4gICAgICogY29vcmRpbmF0ZSBvYmplY3QsIG5vdCBtdXRhdGluZyB0aGUgb2xkIG9uZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB6b29tXG4gICAgICogQHJldHVybnMge0Nvb3JkaW5hdGV9IHpvb21lZCBjb29yZGluYXRlXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIHZhciBjb29yZCA9IG5ldyBDb29yZGluYXRlKDAsIDAsIDApO1xuICAgICAqIHZhciBjMiA9IGNvb3JkLnpvb21UbygxKTtcbiAgICAgKiBjMiAvLyBlcXVhbHMgbmV3IENvb3JkaW5hdGUoMCwgMCwgMSk7XG4gICAgICovXG4gICAgem9vbVRvKHpvb20gICAgICAgICkgeyByZXR1cm4gdGhpcy5jbG9uZSgpLl96b29tVG8oem9vbSk7IH1cblxuICAgIC8qKlxuICAgICAqIFN1YnRyYWN0IHRoZSBjb2x1bW4gYW5kIHJvdyB2YWx1ZXMgb2YgdGhpcyBjb29yZGluYXRlIGZyb20gdGhvc2VcbiAgICAgKiBvZiBhbm90aGVyIGNvb3JkaW5hdGUuIFRoZSBvdGhlciBjb29yZGluYXQgd2lsbCBiZSB6b29tZWQgdG8gdGhlXG4gICAgICogc2FtZSBsZXZlbCBhcyBgdGhpc2AgYmVmb3JlIHRoZSBzdWJ0cmFjdGlvbiBvY2N1cnNcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Q29vcmRpbmF0ZX0gYyBvdGhlciBjb29yZGluYXRlXG4gICAgICogQHJldHVybnMge0Nvb3JkaW5hdGV9IHJlc3VsdFxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgc3ViKGMgICAgICAgICAgICApIHsgcmV0dXJuIHRoaXMuY2xvbmUoKS5fc3ViKGMpOyB9XG5cbiAgICBfem9vbVRvKHpvb20gICAgICAgICkge1xuICAgICAgICBjb25zdCBzY2FsZSA9IE1hdGgucG93KDIsIHpvb20gLSB0aGlzLnpvb20pO1xuICAgICAgICB0aGlzLmNvbHVtbiAqPSBzY2FsZTtcbiAgICAgICAgdGhpcy5yb3cgKj0gc2NhbGU7XG4gICAgICAgIHRoaXMuem9vbSA9IHpvb207XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIF9zdWIoYyAgICAgICAgICAgICkge1xuICAgICAgICBjID0gYy56b29tVG8odGhpcy56b29tKTtcbiAgICAgICAgdGhpcy5jb2x1bW4gLT0gYy5jb2x1bW47XG4gICAgICAgIHRoaXMucm93IC09IGMucm93O1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ29vcmRpbmF0ZTtcbiIsIid1c2Ugc3RyaWN0JztcblxuY29uc3Qgd3JhcCA9IHJlcXVpcmUoJy4uL3V0aWwvdXRpbCcpLndyYXA7XG5cbi8qKlxuICogQSBgTG5nTGF0YCBvYmplY3QgcmVwcmVzZW50cyBhIGdpdmVuIGxvbmdpdHVkZSBhbmQgbGF0aXR1ZGUgY29vcmRpbmF0ZSwgbWVhc3VyZWQgaW4gZGVncmVlcy5cbiAqXG4gKiBNYXBib3ggR0wgdXNlcyBsb25naXR1ZGUsIGxhdGl0dWRlIGNvb3JkaW5hdGUgb3JkZXIgKGFzIG9wcG9zZWQgdG8gbGF0aXR1ZGUsIGxvbmdpdHVkZSkgdG8gbWF0Y2ggR2VvSlNPTi5cbiAqXG4gKiBOb3RlIHRoYXQgYW55IE1hcGJveCBHTCBtZXRob2QgdGhhdCBhY2NlcHRzIGEgYExuZ0xhdGAgb2JqZWN0IGFzIGFuIGFyZ3VtZW50IG9yIG9wdGlvblxuICogY2FuIGFsc28gYWNjZXB0IGFuIGBBcnJheWAgb2YgdHdvIG51bWJlcnMgYW5kIHdpbGwgcGVyZm9ybSBhbiBpbXBsaWNpdCBjb252ZXJzaW9uLlxuICogVGhpcyBmbGV4aWJsZSB0eXBlIGlzIGRvY3VtZW50ZWQgYXMgW2BMbmdMYXRMaWtlYF0oI0xuZ0xhdExpa2UpLlxuICpcbiAqIEBwYXJhbSB7bnVtYmVyfSBsbmcgTG9uZ2l0dWRlLCBtZWFzdXJlZCBpbiBkZWdyZWVzLlxuICogQHBhcmFtIHtudW1iZXJ9IGxhdCBMYXRpdHVkZSwgbWVhc3VyZWQgaW4gZGVncmVlcy5cbiAqIEBleGFtcGxlXG4gKiB2YXIgbGwgPSBuZXcgbWFwYm94Z2wuTG5nTGF0KC03My45NzQ5LCA0MC43NzM2KTtcbiAqIEBzZWUgW0dldCBjb29yZGluYXRlcyBvZiB0aGUgbW91c2UgcG9pbnRlcl0oaHR0cHM6Ly93d3cubWFwYm94LmNvbS9tYXBib3gtZ2wtanMvZXhhbXBsZS9tb3VzZS1wb3NpdGlvbi8pXG4gKiBAc2VlIFtEaXNwbGF5IGEgcG9wdXBdKGh0dHBzOi8vd3d3Lm1hcGJveC5jb20vbWFwYm94LWdsLWpzL2V4YW1wbGUvcG9wdXAvKVxuICogQHNlZSBbSGlnaGxpZ2h0IGZlYXR1cmVzIHdpdGhpbiBhIGJvdW5kaW5nIGJveF0oaHR0cHM6Ly93d3cubWFwYm94LmNvbS9tYXBib3gtZ2wtanMvZXhhbXBsZS91c2luZy1ib3gtcXVlcnlyZW5kZXJlZGZlYXR1cmVzLylcbiAqIEBzZWUgW0NyZWF0ZSBhIHRpbWVsaW5lIGFuaW1hdGlvbl0oaHR0cHM6Ly93d3cubWFwYm94LmNvbS9tYXBib3gtZ2wtanMvZXhhbXBsZS90aW1lbGluZS1hbmltYXRpb24vKVxuICovXG5jbGFzcyBMbmdMYXQge1xuICAgIGNvbnN0cnVjdG9yKGxuZywgbGF0KSB7XG4gICAgICAgIGlmIChpc05hTihsbmcpIHx8IGlzTmFOKGxhdCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBMbmdMYXQgb2JqZWN0OiAoJHtsbmd9LCAke2xhdH0pYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5sbmcgPSArbG5nO1xuICAgICAgICB0aGlzLmxhdCA9ICtsYXQ7XG4gICAgICAgIGlmICh0aGlzLmxhdCA+IDkwIHx8IHRoaXMubGF0IDwgLTkwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgTG5nTGF0IGxhdGl0dWRlIHZhbHVlOiBtdXN0IGJlIGJldHdlZW4gLTkwIGFuZCA5MCcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIG5ldyBgTG5nTGF0YCBvYmplY3Qgd2hvc2UgbG9uZ2l0dWRlIGlzIHdyYXBwZWQgdG8gdGhlIHJhbmdlICgtMTgwLCAxODApLlxuICAgICAqXG4gICAgICogQHJldHVybnMge0xuZ0xhdH0gVGhlIHdyYXBwZWQgYExuZ0xhdGAgb2JqZWN0LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogdmFyIGxsID0gbmV3IG1hcGJveGdsLkxuZ0xhdCgyODYuMDI1MSwgNDAuNzczNik7XG4gICAgICogdmFyIHdyYXBwZWQgPSBsbC53cmFwKCk7XG4gICAgICogd3JhcHBlZC5sbmc7IC8vID0gLTczLjk3NDlcbiAgICAgKi9cbiAgICB3cmFwKCkge1xuICAgICAgICByZXR1cm4gbmV3IExuZ0xhdCh3cmFwKHRoaXMubG5nLCAtMTgwLCAxODApLCB0aGlzLmxhdCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIG5ldyBgTG5nTGF0YCBvYmplY3Qgd3JhcHBlZCB0byB0aGUgYmVzdCB3b3JsZCB0byBkcmF3IGl0IHByb3ZpZGVkIGEgbWFwIGBjZW50ZXJgIGBMbmdMYXRgLlxuICAgICAqXG4gICAgICogV2hlbiB0aGUgbWFwIGlzIGNsb3NlIHRvIHRoZSBhbnRpLW1lcmlkaWFuIHNob3dpbmcgYSBwb2ludCBvbiB3b3JsZCAtMSBvciAxIGlzIGEgYmV0dGVyXG4gICAgICogY2hvaWNlLiBUaGUgaGV1cmlzdGljIHVzZWQgaXMgdG8gbWluaW1pemUgdGhlIGRpc3RhbmNlIGZyb20gdGhlIG1hcCBjZW50ZXIgdG8gdGhlIHBvaW50LlxuICAgICAqXG4gICAgICogT25seSB3b3JrcyB3aGVyZSB0aGUgYExuZ0xhdGAgaXMgd3JhcHBlZCB3aXRoIGBMbmdMYXQud3JhcCgpYCBhbmQgYGNlbnRlcmAgaXMgd2l0aGluIHRoZSBtYWluIHdvcmxkIG1hcC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TG5nTGF0fSBjZW50ZXIgTWFwIGNlbnRlciB3aXRoaW4gdGhlIG1haW4gd29ybGQuXG4gICAgICogQHJldHVybiB7TG5nTGF0fSBUaGUgYExuZ0xhdGAgb2JqZWN0IGluIHRoZSBiZXN0IHdvcmxkIHRvIGRyYXcgaXQgZm9yIHRoZSBwcm92aWRlZCBtYXAgYGNlbnRlcmAuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB2YXIgbGwgPSBuZXcgbWFwYm94Z2wuTG5nTGF0KDE3MCwgMCk7XG4gICAgICogdmFyIG1hcENlbnRlciA9IG5ldyBtYXBib3hnbC5MbmdMYXQoLTE3MCwgMCk7XG4gICAgICogdmFyIHNuYXBwZWQgPSBsbC53cmFwVG9CZXN0V29ybGQobWFwQ2VudGVyKTtcbiAgICAgKiBzbmFwcGVkOyAvLyA9IHsgbG5nOiAtMTkwLCBsYXQ6IDAgfVxuICAgICAqL1xuICAgIHdyYXBUb0Jlc3RXb3JsZChjZW50ZXIpIHtcbiAgICAgICAgY29uc3Qgd3JhcHBlZCA9IG5ldyBMbmdMYXQodGhpcy5sbmcsIHRoaXMubGF0KTtcblxuICAgICAgICBpZiAoTWF0aC5hYnModGhpcy5sbmcgLSBjZW50ZXIubG5nKSA+IDE4MCkge1xuICAgICAgICAgICAgaWYgKGNlbnRlci5sbmcgPCAwKSB7XG4gICAgICAgICAgICAgICAgd3JhcHBlZC5sbmcgLT0gMzYwO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3cmFwcGVkLmxuZyArPSAzNjA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gd3JhcHBlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjb29yZGluYXRlcyByZXByZXNlbnRlZCBhcyBhbiBhcnJheSBvZiB0d28gbnVtYmVycy5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtBcnJheTxudW1iZXI+fSBUaGUgY29vcmRpbmF0ZXMgcmVwcmVzZXRlZCBhcyBhbiBhcnJheSBvZiBsb25naXR1ZGUgYW5kIGxhdGl0dWRlLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogdmFyIGxsID0gbmV3IG1hcGJveGdsLkxuZ0xhdCgtNzMuOTc0OSwgNDAuNzczNik7XG4gICAgICogbGwudG9BcnJheSgpOyAvLyA9IFstNzMuOTc0OSwgNDAuNzczNl1cbiAgICAgKi9cbiAgICB0b0FycmF5KCkge1xuICAgICAgICByZXR1cm4gW3RoaXMubG5nLCB0aGlzLmxhdF07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY29vcmRpbmF0ZXMgcmVwcmVzZW50IGFzIGEgc3RyaW5nLlxuICAgICAqXG4gICAgICogQHJldHVybnMge3N0cmluZ30gVGhlIGNvb3JkaW5hdGVzIHJlcHJlc2VudGVkIGFzIGEgc3RyaW5nIG9mIHRoZSBmb3JtYXQgYCdMbmdMYXQobG5nLCBsYXQpJ2AuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB2YXIgbGwgPSBuZXcgbWFwYm94Z2wuTG5nTGF0KC03My45NzQ5LCA0MC43NzM2KTtcbiAgICAgKiBsbC50b1N0cmluZygpOyAvLyA9IFwiTG5nTGF0KC03My45NzQ5LCA0MC43NzM2KVwiXG4gICAgICovXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiBgTG5nTGF0KCR7dGhpcy5sbmd9LCAke3RoaXMubGF0fSlgO1xuICAgIH1cbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBhbiBhcnJheSBvZiB0d28gbnVtYmVycyB0byBhIGBMbmdMYXRgIG9iamVjdC5cbiAqXG4gKiBJZiBhIGBMbmdMYXRgIG9iamVjdCBpcyBwYXNzZWQgaW4sIHRoZSBmdW5jdGlvbiByZXR1cm5zIGl0IHVuY2hhbmdlZC5cbiAqXG4gKiBAcGFyYW0ge0xuZ0xhdExpa2V9IGlucHV0IEFuIGFycmF5IG9mIHR3byBudW1iZXJzIHRvIGNvbnZlcnQsIG9yIGEgYExuZ0xhdGAgb2JqZWN0IHRvIHJldHVybi5cbiAqIEByZXR1cm5zIHtMbmdMYXR9IEEgbmV3IGBMbmdMYXRgIG9iamVjdCwgaWYgYSBjb252ZXJzaW9uIG9jY3VycmVkLCBvciB0aGUgb3JpZ2luYWwgYExuZ0xhdGAgb2JqZWN0LlxuICogQGV4YW1wbGVcbiAqIHZhciBhcnIgPSBbLTczLjk3NDksIDQwLjc3MzZdO1xuICogdmFyIGxsID0gbWFwYm94Z2wuTG5nTGF0LmNvbnZlcnQoYXJyKTtcbiAqIGxsOyAgIC8vID0gTG5nTGF0IHtsbmc6IC03My45NzQ5LCBsYXQ6IDQwLjc3MzZ9XG4gKi9cbkxuZ0xhdC5jb252ZXJ0ID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gICAgaWYgKGlucHV0IGluc3RhbmNlb2YgTG5nTGF0KSB7XG4gICAgICAgIHJldHVybiBpbnB1dDtcbiAgICB9IGVsc2UgaWYgKGlucHV0ICYmIGlucHV0Lmhhc093blByb3BlcnR5KCdsbmcnKSAmJiBpbnB1dC5oYXNPd25Qcm9wZXJ0eSgnbGF0JykpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBMbmdMYXQoaW5wdXQubG5nLCBpbnB1dC5sYXQpO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShpbnB1dCkgJiYgaW5wdXQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHJldHVybiBuZXcgTG5nTGF0KGlucHV0WzBdLCBpbnB1dFsxXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYExuZ0xhdExpa2VgIGFyZ3VtZW50IG11c3QgYmUgc3BlY2lmaWVkIGFzIGEgTG5nTGF0IGluc3RhbmNlLCBhbiBvYmplY3Qge2xuZzogPGxuZz4sIGxhdDogPGxhdD59LCBvciBhbiBhcnJheSBvZiBbPGxuZz4sIDxsYXQ+XVwiKTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IExuZ0xhdDtcbiIsIid1c2Ugc3RyaWN0JztcblxuY29uc3QgTG5nTGF0ID0gcmVxdWlyZSgnLi9sbmdfbGF0Jyk7XG5cbi8qKlxuICogQSBgTG5nTGF0Qm91bmRzYCBvYmplY3QgcmVwcmVzZW50cyBhIGdlb2dyYXBoaWNhbCBib3VuZGluZyBib3gsXG4gKiBkZWZpbmVkIGJ5IGl0cyBzb3V0aHdlc3QgYW5kIG5vcnRoZWFzdCBwb2ludHMgaW4gbG9uZ2l0dWRlIGFuZCBsYXRpdHVkZS5cbiAqXG4gKiBJZiBubyBhcmd1bWVudHMgYXJlIHByb3ZpZGVkIHRvIHRoZSBjb25zdHJ1Y3RvciwgYSBgbnVsbGAgYm91bmRpbmcgYm94IGlzIGNyZWF0ZWQuXG4gKlxuICogTm90ZSB0aGF0IGFueSBNYXBib3ggR0wgbWV0aG9kIHRoYXQgYWNjZXB0cyBhIGBMbmdMYXRCb3VuZHNgIG9iamVjdCBhcyBhbiBhcmd1bWVudCBvciBvcHRpb25cbiAqIGNhbiBhbHNvIGFjY2VwdCBhbiBgQXJyYXlgIG9mIHR3byBbYExuZ0xhdExpa2VgXSgjTG5nTGF0TGlrZSkgY29uc3RydWN0cyBhbmQgd2lsbCBwZXJmb3JtIGFuIGltcGxpY2l0IGNvbnZlcnNpb24uXG4gKiBUaGlzIGZsZXhpYmxlIHR5cGUgaXMgZG9jdW1lbnRlZCBhcyBbYExuZ0xhdEJvdW5kc0xpa2VgXSgjTG5nTGF0Qm91bmRzTGlrZSkuXG4gKlxuICogQHBhcmFtIHtMbmdMYXRMaWtlfSBbc3ddIFRoZSBzb3V0aHdlc3QgY29ybmVyIG9mIHRoZSBib3VuZGluZyBib3guXG4gKiBAcGFyYW0ge0xuZ0xhdExpa2V9IFtuZV0gVGhlIG5vcnRoZWFzdCBjb3JuZXIgb2YgdGhlIGJvdW5kaW5nIGJveC5cbiAqIEBleGFtcGxlXG4gKiB2YXIgc3cgPSBuZXcgbWFwYm94Z2wuTG5nTGF0KC03My45ODc2LCA0MC43NjYxKTtcbiAqIHZhciBuZSA9IG5ldyBtYXBib3hnbC5MbmdMYXQoLTczLjkzOTcsIDQwLjgwMDIpO1xuICogdmFyIGxsYiA9IG5ldyBtYXBib3hnbC5MbmdMYXRCb3VuZHMoc3csIG5lKTtcbiAqL1xuY2xhc3MgTG5nTGF0Qm91bmRzIHtcbiAgICBjb25zdHJ1Y3RvcihzdywgbmUpIHtcbiAgICAgICAgaWYgKCFzdykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKG5lKSB7XG4gICAgICAgICAgICB0aGlzLnNldFNvdXRoV2VzdChzdykuc2V0Tm9ydGhFYXN0KG5lKTtcbiAgICAgICAgfSBlbHNlIGlmIChzdy5sZW5ndGggPT09IDQpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0U291dGhXZXN0KFtzd1swXSwgc3dbMV1dKS5zZXROb3J0aEVhc3QoW3N3WzJdLCBzd1szXV0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zZXRTb3V0aFdlc3Qoc3dbMF0pLnNldE5vcnRoRWFzdChzd1sxXSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIG5vcnRoZWFzdCBjb3JuZXIgb2YgdGhlIGJvdW5kaW5nIGJveFxuICAgICAqXG4gICAgICogQHBhcmFtIHtMbmdMYXRMaWtlfSBuZVxuICAgICAqIEByZXR1cm5zIHtMbmdMYXRCb3VuZHN9IGB0aGlzYFxuICAgICAqL1xuICAgIHNldE5vcnRoRWFzdChuZSkge1xuICAgICAgICB0aGlzLl9uZSA9IExuZ0xhdC5jb252ZXJ0KG5lKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IHRoZSBzb3V0aHdlc3QgY29ybmVyIG9mIHRoZSBib3VuZGluZyBib3hcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TG5nTGF0TGlrZX0gc3dcbiAgICAgKiBAcmV0dXJucyB7TG5nTGF0Qm91bmRzfSBgdGhpc2BcbiAgICAgKi9cbiAgICBzZXRTb3V0aFdlc3Qoc3cpIHtcbiAgICAgICAgdGhpcy5fc3cgPSBMbmdMYXQuY29udmVydChzdyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4dGVuZCB0aGUgYm91bmRzIHRvIGluY2x1ZGUgYSBnaXZlbiBMbmdMYXQgb3IgTG5nTGF0Qm91bmRzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtMbmdMYXR8TG5nTGF0Qm91bmRzfSBvYmogb2JqZWN0IHRvIGV4dGVuZCB0b1xuICAgICAqIEByZXR1cm5zIHtMbmdMYXRCb3VuZHN9IGB0aGlzYFxuICAgICAqL1xuICAgIGV4dGVuZChvYmopIHtcbiAgICAgICAgY29uc3Qgc3cgPSB0aGlzLl9zdyxcbiAgICAgICAgICAgIG5lID0gdGhpcy5fbmU7XG4gICAgICAgIGxldCBzdzIsIG5lMjtcblxuICAgICAgICBpZiAob2JqIGluc3RhbmNlb2YgTG5nTGF0KSB7XG4gICAgICAgICAgICBzdzIgPSBvYmo7XG4gICAgICAgICAgICBuZTIgPSBvYmo7XG5cbiAgICAgICAgfSBlbHNlIGlmIChvYmogaW5zdGFuY2VvZiBMbmdMYXRCb3VuZHMpIHtcbiAgICAgICAgICAgIHN3MiA9IG9iai5fc3c7XG4gICAgICAgICAgICBuZTIgPSBvYmouX25lO1xuXG4gICAgICAgICAgICBpZiAoIXN3MiB8fCAhbmUyKSByZXR1cm4gdGhpcztcblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob2JqKSkge1xuICAgICAgICAgICAgICAgIGlmIChvYmouZXZlcnkoQXJyYXkuaXNBcnJheSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXh0ZW5kKExuZ0xhdEJvdW5kcy5jb252ZXJ0KG9iaikpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmV4dGVuZChMbmdMYXQuY29udmVydChvYmopKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghc3cgJiYgIW5lKSB7XG4gICAgICAgICAgICB0aGlzLl9zdyA9IG5ldyBMbmdMYXQoc3cyLmxuZywgc3cyLmxhdCk7XG4gICAgICAgICAgICB0aGlzLl9uZSA9IG5ldyBMbmdMYXQobmUyLmxuZywgbmUyLmxhdCk7XG5cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN3LmxuZyA9IE1hdGgubWluKHN3Mi5sbmcsIHN3LmxuZyk7XG4gICAgICAgICAgICBzdy5sYXQgPSBNYXRoLm1pbihzdzIubGF0LCBzdy5sYXQpO1xuICAgICAgICAgICAgbmUubG5nID0gTWF0aC5tYXgobmUyLmxuZywgbmUubG5nKTtcbiAgICAgICAgICAgIG5lLmxhdCA9IE1hdGgubWF4KG5lMi5sYXQsIG5lLmxhdCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBnZW9ncmFwaGljYWwgY29vcmRpbmF0ZSBlcXVpZGlzdGFudCBmcm9tIHRoZSBib3VuZGluZyBib3gncyBjb3JuZXJzLlxuICAgICAqXG4gICAgICogQHJldHVybnMge0xuZ0xhdH0gVGhlIGJvdW5kaW5nIGJveCdzIGNlbnRlci5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIHZhciBsbGIgPSBuZXcgbWFwYm94Z2wuTG5nTGF0Qm91bmRzKFstNzMuOTg3NiwgNDAuNzY2MV0sIFstNzMuOTM5NywgNDAuODAwMl0pO1xuICAgICAqIGxsYi5nZXRDZW50ZXIoKTsgLy8gPSBMbmdMYXQge2xuZzogLTczLjk2MzY1LCBsYXQ6IDQwLjc4MzE1fVxuICAgICAqL1xuICAgIGdldENlbnRlcigpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBMbmdMYXQoKHRoaXMuX3N3LmxuZyArIHRoaXMuX25lLmxuZykgLyAyLCAodGhpcy5fc3cubGF0ICsgdGhpcy5fbmUubGF0KSAvIDIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHNvdXRod2VzdCBjb3JuZXIgb2YgdGhlIGJvdW5kaW5nIGJveC5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtMbmdMYXR9IFRoZSBzb3V0aHdlc3QgY29ybmVyIG9mIHRoZSBib3VuZGluZyBib3guXG4gICAgICovXG4gICAgZ2V0U291dGhXZXN0KCkgeyByZXR1cm4gdGhpcy5fc3c7IH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgbm9ydGhlYXN0IGNvcm5lciBvZiB0aGUgYm91bmRpbmcgYm94LlxuICAgICpcbiAgICAqIEByZXR1cm5zIHtMbmdMYXR9IFRoZSBub3J0aGVhc3QgY29ybmVyIG9mIHRoZSBib3VuZGluZyBib3guXG4gICAgICovXG4gICAgZ2V0Tm9ydGhFYXN0KCkgeyByZXR1cm4gdGhpcy5fbmU7IH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgbm9ydGh3ZXN0IGNvcm5lciBvZiB0aGUgYm91bmRpbmcgYm94LlxuICAgICpcbiAgICAqIEByZXR1cm5zIHtMbmdMYXR9IFRoZSBub3J0aHdlc3QgY29ybmVyIG9mIHRoZSBib3VuZGluZyBib3guXG4gICAgICovXG4gICAgZ2V0Tm9ydGhXZXN0KCkgeyByZXR1cm4gbmV3IExuZ0xhdCh0aGlzLmdldFdlc3QoKSwgdGhpcy5nZXROb3J0aCgpKTsgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBzb3V0aGVhc3QgY29ybmVyIG9mIHRoZSBib3VuZGluZyBib3guXG4gICAgKlxuICAgICogQHJldHVybnMge0xuZ0xhdH0gVGhlIHNvdXRoZWFzdCBjb3JuZXIgb2YgdGhlIGJvdW5kaW5nIGJveC5cbiAgICAgKi9cbiAgICBnZXRTb3V0aEVhc3QoKSB7IHJldHVybiBuZXcgTG5nTGF0KHRoaXMuZ2V0RWFzdCgpLCB0aGlzLmdldFNvdXRoKCkpOyB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIHdlc3QgZWRnZSBvZiB0aGUgYm91bmRpbmcgYm94LlxuICAgICpcbiAgICAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSB3ZXN0IGVkZ2Ugb2YgdGhlIGJvdW5kaW5nIGJveC5cbiAgICAgKi9cbiAgICBnZXRXZXN0KCkgeyByZXR1cm4gdGhpcy5fc3cubG5nOyB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIHNvdXRoIGVkZ2Ugb2YgdGhlIGJvdW5kaW5nIGJveC5cbiAgICAqXG4gICAgKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgc291dGggZWRnZSBvZiB0aGUgYm91bmRpbmcgYm94LlxuICAgICAqL1xuICAgIGdldFNvdXRoKCkgeyByZXR1cm4gdGhpcy5fc3cubGF0OyB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGVhc3QgZWRnZSBvZiB0aGUgYm91bmRpbmcgYm94LlxuICAgICpcbiAgICAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBlYXN0IGVkZ2Ugb2YgdGhlIGJvdW5kaW5nIGJveC5cbiAgICAgKi9cbiAgICBnZXRFYXN0KCkgeyByZXR1cm4gdGhpcy5fbmUubG5nOyB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIG5vcnRoIGVkZ2Ugb2YgdGhlIGJvdW5kaW5nIGJveC5cbiAgICAqXG4gICAgKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgbm9ydGggZWRnZSBvZiB0aGUgYm91bmRpbmcgYm94LlxuICAgICAqL1xuICAgIGdldE5vcnRoKCkgeyByZXR1cm4gdGhpcy5fbmUubGF0OyB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBib3VuZGluZyBib3ggcmVwcmVzZW50ZWQgYXMgYW4gYXJyYXkuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7QXJyYXk8QXJyYXk8bnVtYmVyPj59IFRoZSBib3VuZGluZyBib3ggcmVwcmVzZW50ZWQgYXMgYW4gYXJyYXksIGNvbnNpc3Rpbmcgb2YgdGhlXG4gICAgICogICBzb3V0aHdlc3QgYW5kIG5vcnRoZWFzdCBjb29yZGluYXRlcyBvZiB0aGUgYm91bmRpbmcgcmVwcmVzZW50ZWQgYXMgYXJyYXlzIG9mIG51bWJlcnMuXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB2YXIgbGxiID0gbmV3IG1hcGJveGdsLkxuZ0xhdEJvdW5kcyhbLTczLjk4NzYsIDQwLjc2NjFdLCBbLTczLjkzOTcsIDQwLjgwMDJdKTtcbiAgICAgKiBsbGIudG9BcnJheSgpOyAvLyA9IFtbLTczLjk4NzYsIDQwLjc2NjFdLCBbLTczLjkzOTcsIDQwLjgwMDJdXVxuICAgICAqL1xuICAgIHRvQXJyYXkgKCkge1xuICAgICAgICByZXR1cm4gW3RoaXMuX3N3LnRvQXJyYXkoKSwgdGhpcy5fbmUudG9BcnJheSgpXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gdGhlIGJvdW5kaW5nIGJveCByZXByZXNlbnRlZCBhcyBhIHN0cmluZy5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9IFRoZSBib3VuZGluZyBib3ggcmVwcmVzZW50cyBhcyBhIHN0cmluZyBvZiB0aGUgZm9ybWF0XG4gICAgICogICBgJ0xuZ0xhdEJvdW5kcyhMbmdMYXQobG5nLCBsYXQpLCBMbmdMYXQobG5nLCBsYXQpKSdgLlxuICAgICAqIEBleGFtcGxlXG4gICAgICogdmFyIGxsYiA9IG5ldyBtYXBib3hnbC5MbmdMYXRCb3VuZHMoWy03My45ODc2LCA0MC43NjYxXSwgWy03My45Mzk3LCA0MC44MDAyXSk7XG4gICAgICogbGxiLnRvU3RyaW5nKCk7IC8vID0gXCJMbmdMYXRCb3VuZHMoTG5nTGF0KC03My45ODc2LCA0MC43NjYxKSwgTG5nTGF0KC03My45Mzk3LCA0MC44MDAyKSlcIlxuICAgICAqL1xuICAgIHRvU3RyaW5nICgpIHtcbiAgICAgICAgcmV0dXJuIGBMbmdMYXRCb3VuZHMoJHt0aGlzLl9zdy50b1N0cmluZygpfSwgJHt0aGlzLl9uZS50b1N0cmluZygpfSlgO1xuICAgIH1cbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBhbiBhcnJheSB0byBhIGBMbmdMYXRCb3VuZHNgIG9iamVjdC5cbiAqXG4gKiBJZiBhIGBMbmdMYXRCb3VuZHNgIG9iamVjdCBpcyBwYXNzZWQgaW4sIHRoZSBmdW5jdGlvbiByZXR1cm5zIGl0IHVuY2hhbmdlZC5cbiAqXG4gKiBJbnRlcm5hbGx5LCB0aGUgZnVuY3Rpb24gY2FsbHMgYExuZ0xhdCNjb252ZXJ0YCB0byBjb252ZXJ0IGFycmF5cyB0byBgTG5nTGF0YCB2YWx1ZXMuXG4gKlxuICogQHBhcmFtIHtMbmdMYXRCb3VuZHNMaWtlfSBpbnB1dCBBbiBhcnJheSBvZiB0d28gY29vcmRpbmF0ZXMgdG8gY29udmVydCwgb3IgYSBgTG5nTGF0Qm91bmRzYCBvYmplY3QgdG8gcmV0dXJuLlxuICogQHJldHVybnMge0xuZ0xhdEJvdW5kc30gQSBuZXcgYExuZ0xhdEJvdW5kc2Agb2JqZWN0LCBpZiBhIGNvbnZlcnNpb24gb2NjdXJyZWQsIG9yIHRoZSBvcmlnaW5hbCBgTG5nTGF0Qm91bmRzYCBvYmplY3QuXG4gKiBAZXhhbXBsZVxuICogdmFyIGFyciA9IFtbLTczLjk4NzYsIDQwLjc2NjFdLCBbLTczLjkzOTcsIDQwLjgwMDJdXTtcbiAqIHZhciBsbGIgPSBtYXBib3hnbC5MbmdMYXRCb3VuZHMuY29udmVydChhcnIpO1xuICogbGxiOyAgIC8vID0gTG5nTGF0Qm91bmRzIHtfc3c6IExuZ0xhdCB7bG5nOiAtNzMuOTg3NiwgbGF0OiA0MC43NjYxfSwgX25lOiBMbmdMYXQge2xuZzogLTczLjkzOTcsIGxhdDogNDAuODAwMn19XG4gKi9cbkxuZ0xhdEJvdW5kcy5jb252ZXJ0ID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gICAgaWYgKCFpbnB1dCB8fCBpbnB1dCBpbnN0YW5jZW9mIExuZ0xhdEJvdW5kcykgcmV0dXJuIGlucHV0O1xuICAgIHJldHVybiBuZXcgTG5nTGF0Qm91bmRzKGlucHV0KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTG5nTGF0Qm91bmRzO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCBMbmdMYXRCb3VuZHMgPSByZXF1aXJlKCcuLi9nZW8vbG5nX2xhdF9ib3VuZHMnKTtcbmNvbnN0IGNsYW1wID0gcmVxdWlyZSgnLi4vdXRpbC91dGlsJykuY2xhbXA7XG5cbmNsYXNzIFRpbGVCb3VuZHMge1xuICAgIGNvbnN0cnVjdG9yKGJvdW5kcywgbWluem9vbSwgbWF4em9vbSkge1xuICAgICAgICB0aGlzLmJvdW5kcyA9IExuZ0xhdEJvdW5kcy5jb252ZXJ0KGJvdW5kcyk7XG4gICAgICAgIHRoaXMubWluem9vbSA9IG1pbnpvb20gfHwgMDtcbiAgICAgICAgdGhpcy5tYXh6b29tID0gbWF4em9vbSB8fCAyNDtcbiAgICB9XG5cbiAgICBjb250YWlucyhjb29yZCwgbWF4em9vbSkge1xuICAgICAgICAvLyBUaWxlQ29vcmQgcmV0dXJucyBpbmNvcnJlY3QgeiBmb3Igb3ZlcnNjYWxlZCB0aWxlcywgc28gd2UgdXNlIHRoaXNcbiAgICAgICAgLy8gdG8gbWFrZSBzdXJlIG92ZXJ6b29tZWQgdGlsZXMgc3RpbGwgZ2V0IGRpc3BsYXllZC5cbiAgICAgICAgY29uc3QgdGlsZVogPSBtYXh6b29tID8gTWF0aC5taW4oY29vcmQueiwgbWF4em9vbSkgOiBjb29yZC56O1xuXG4gICAgICAgIGNvbnN0IGxldmVsID0ge1xuICAgICAgICAgICAgbWluWDogTWF0aC5mbG9vcih0aGlzLmxuZ1godGhpcy5ib3VuZHMuZ2V0V2VzdCgpLCB0aWxlWikpLFxuICAgICAgICAgICAgbWluWTogTWF0aC5mbG9vcih0aGlzLmxhdFkodGhpcy5ib3VuZHMuZ2V0Tm9ydGgoKSwgdGlsZVopKSxcbiAgICAgICAgICAgIG1heFg6IE1hdGguY2VpbCh0aGlzLmxuZ1godGhpcy5ib3VuZHMuZ2V0RWFzdCgpLCB0aWxlWikpLFxuICAgICAgICAgICAgbWF4WTogTWF0aC5jZWlsKHRoaXMubGF0WSh0aGlzLmJvdW5kcy5nZXRTb3V0aCgpLCB0aWxlWikpXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGhpdCA9IGNvb3JkLnggPj0gbGV2ZWwubWluWCAmJiBjb29yZC54IDwgbGV2ZWwubWF4WCAmJiBjb29yZC55ID49IGxldmVsLm1pblkgJiYgY29vcmQueSA8IGxldmVsLm1heFk7XG4gICAgICAgIHJldHVybiBoaXQ7XG4gICAgfVxuXG4gICAgbG5nWChsbmcsIHpvb20pIHtcbiAgICAgICAgcmV0dXJuIChsbmcgKyAxODApICogKE1hdGgucG93KDIsIHpvb20pIC8gMzYwKTtcbiAgICB9XG5cbiAgICBsYXRZKGxhdCwgem9vbSkge1xuICAgICAgICBjb25zdCBmID0gY2xhbXAoTWF0aC5zaW4oTWF0aC5QSSAvIDE4MCAqIGxhdCksIC0wLjk5OTksIDAuOTk5OSk7XG4gICAgICAgIGNvbnN0IHNjYWxlID0gTWF0aC5wb3coMiwgem9vbSkgLyAoMiAqIE1hdGguUEkpO1xuICAgICAgICByZXR1cm4gTWF0aC5wb3coMiwgem9vbSAtIDEpICsgMC41ICogTWF0aC5sb2coKDEgKyBmKSAvICgxIC0gZikpICogLXNjYWxlO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBUaWxlQm91bmRzO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCB3aW5kb3cgPSByZXF1aXJlKCcuL3dpbmRvdycpO1xuXG5jbGFzcyBBSkFYRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gICAgY29uc3RydWN0b3IobWVzc2FnZSwgc3RhdHVzKSB7XG4gICAgICAgIHN1cGVyKG1lc3NhZ2UpO1xuICAgICAgICB0aGlzLnN0YXR1cyA9IHN0YXR1cztcbiAgICB9XG59XG5cbmV4cG9ydHMuZ2V0SlNPTiA9IGZ1bmN0aW9uKHVybCwgY2FsbGJhY2spIHtcbiAgICBjb25zdCB4aHIgPSBuZXcgd2luZG93LlhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgeGhyLm9wZW4oJ0dFVCcsIHVybCwgdHJ1ZSk7XG4gICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ0FjY2VwdCcsICdhcHBsaWNhdGlvbi9qc29uJyk7XG4gICAgeGhyLm9uZXJyb3IgPSBmdW5jdGlvbihlKSB7XG4gICAgICAgIGNhbGxiYWNrKGUpO1xuICAgIH07XG4gICAgeGhyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoeGhyLnN0YXR1cyA+PSAyMDAgJiYgeGhyLnN0YXR1cyA8IDMwMCAmJiB4aHIucmVzcG9uc2UpIHtcbiAgICAgICAgICAgIGxldCBkYXRhO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBkYXRhID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2UpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBBSkFYRXJyb3IoeGhyLnN0YXR1c1RleHQsIHhoci5zdGF0dXMpKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgeGhyLnNlbmQoKTtcbiAgICByZXR1cm4geGhyO1xufTtcblxuZXhwb3J0cy5nZXRBcnJheUJ1ZmZlciA9IGZ1bmN0aW9uKHVybCwgY2FsbGJhY2spIHtcbiAgICBjb25zdCB4aHIgPSBuZXcgd2luZG93LlhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgeGhyLm9wZW4oJ0dFVCcsIHVybCwgdHJ1ZSk7XG4gICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdhcnJheWJ1ZmZlcic7XG4gICAgeGhyLm9uZXJyb3IgPSBmdW5jdGlvbihlKSB7XG4gICAgICAgIGNhbGxiYWNrKGUpO1xuICAgIH07XG4gICAgeGhyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoeGhyLnJlc3BvbnNlLmJ5dGVMZW5ndGggPT09IDAgJiYgeGhyLnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCdodHRwIHN0YXR1cyAyMDAgcmV0dXJuZWQgd2l0aG91dCBjb250ZW50LicpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoeGhyLnN0YXR1cyA+PSAyMDAgJiYgeGhyLnN0YXR1cyA8IDMwMCAmJiB4aHIucmVzcG9uc2UpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHtcbiAgICAgICAgICAgICAgICBkYXRhOiB4aHIucmVzcG9uc2UsXG4gICAgICAgICAgICAgICAgY2FjaGVDb250cm9sOiB4aHIuZ2V0UmVzcG9uc2VIZWFkZXIoJ0NhY2hlLUNvbnRyb2wnKSxcbiAgICAgICAgICAgICAgICBleHBpcmVzOiB4aHIuZ2V0UmVzcG9uc2VIZWFkZXIoJ0V4cGlyZXMnKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWxsYmFjayhuZXcgQUpBWEVycm9yKHhoci5zdGF0dXNUZXh0LCB4aHIuc3RhdHVzKSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHhoci5zZW5kKCk7XG4gICAgcmV0dXJuIHhocjtcbn07XG5cbmZ1bmN0aW9uIHNhbWVPcmlnaW4odXJsKSB7XG4gICAgY29uc3QgYSA9IHdpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgYS5ocmVmID0gdXJsO1xuICAgIHJldHVybiBhLnByb3RvY29sID09PSB3aW5kb3cuZG9jdW1lbnQubG9jYXRpb24ucHJvdG9jb2wgJiYgYS5ob3N0ID09PSB3aW5kb3cuZG9jdW1lbnQubG9jYXRpb24uaG9zdDtcbn1cblxuY29uc3QgdHJhbnNwYXJlbnRQbmdVcmwgPSAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFBRUFBQUFCQ0FZQUFBQWZGY1NKQUFBQUMwbEVRVlFZVjJOZ0FBSUFBQVVBQWFyVnlGRUFBQUFBU1VWT1JLNUNZSUk9JztcblxuZXhwb3J0cy5nZXRJbWFnZSA9IGZ1bmN0aW9uKHVybCwgY2FsbGJhY2spIHtcbiAgICAvLyByZXF1ZXN0IHRoZSBpbWFnZSB3aXRoIFhIUiB0byB3b3JrIGFyb3VuZCBjYWNoaW5nIGlzc3Vlc1xuICAgIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWFwYm94L21hcGJveC1nbC1qcy9pc3N1ZXMvMTQ3MFxuICAgIHJldHVybiBleHBvcnRzLmdldEFycmF5QnVmZmVyKHVybCwgKGVyciwgaW1nRGF0YSkgPT4ge1xuICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgY29uc3QgaW1nID0gbmV3IHdpbmRvdy5JbWFnZSgpO1xuICAgICAgICBjb25zdCBVUkwgPSB3aW5kb3cuVVJMIHx8IHdpbmRvdy53ZWJraXRVUkw7XG4gICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBpbWcpO1xuICAgICAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChpbWcuc3JjKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyB3aW5kb3cuQmxvYihbbmV3IFVpbnQ4QXJyYXkoaW1nRGF0YS5kYXRhKV0sIHsgdHlwZTogJ2ltYWdlL3BuZycgfSk7XG4gICAgICAgIGltZy5jYWNoZUNvbnRyb2wgPSBpbWdEYXRhLmNhY2hlQ29udHJvbDtcbiAgICAgICAgaW1nLmV4cGlyZXMgPSBpbWdEYXRhLmV4cGlyZXM7XG4gICAgICAgIGltZy5zcmMgPSBpbWdEYXRhLmRhdGEuYnl0ZUxlbmd0aCA/IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYikgOiB0cmFuc3BhcmVudFBuZ1VybDtcbiAgICB9KTtcbn07XG5cbmV4cG9ydHMuZ2V0VmlkZW8gPSBmdW5jdGlvbih1cmxzLCBjYWxsYmFjaykge1xuICAgIGNvbnN0IHZpZGVvID0gd2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJyk7XG4gICAgdmlkZW8ub25sb2Fkc3RhcnQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgdmlkZW8pO1xuICAgIH07XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB1cmxzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHMgPSB3aW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc291cmNlJyk7XG4gICAgICAgIGlmICghc2FtZU9yaWdpbih1cmxzW2ldKSkge1xuICAgICAgICAgICAgdmlkZW8uY3Jvc3NPcmlnaW4gPSAnQW5vbnltb3VzJztcbiAgICAgICAgfVxuICAgICAgICBzLnNyYyA9IHVybHNbaV07XG4gICAgICAgIHZpZGVvLmFwcGVuZENoaWxkKHMpO1xuICAgIH1cbiAgICByZXR1cm4gdmlkZW87XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIEBtb2R1bGUgYnJvd3NlclxuICogQHByaXZhdGVcbiAqL1xuXG5jb25zdCB3aW5kb3cgPSByZXF1aXJlKCcuL3dpbmRvdycpO1xuXG4vKipcbiAqIFByb3ZpZGVzIGEgZnVuY3Rpb24gdGhhdCBvdXRwdXRzIG1pbGxpc2Vjb25kczogZWl0aGVyIHBlcmZvcm1hbmNlLm5vdygpXG4gKiBvciBhIGZhbGxiYWNrIHRvIERhdGUubm93KClcbiAqL1xubW9kdWxlLmV4cG9ydHMubm93ID0gKGZ1bmN0aW9uKCkge1xuICAgIGlmICh3aW5kb3cucGVyZm9ybWFuY2UgJiZcbiAgICAgICAgd2luZG93LnBlcmZvcm1hbmNlLm5vdykge1xuICAgICAgICByZXR1cm4gd2luZG93LnBlcmZvcm1hbmNlLm5vdy5iaW5kKHdpbmRvdy5wZXJmb3JtYW5jZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIERhdGUubm93LmJpbmQoRGF0ZSk7XG4gICAgfVxufSgpKTtcblxuY29uc3QgZnJhbWUgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gICAgd2luZG93Lm1velJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuICAgIHdpbmRvdy53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcbiAgICB3aW5kb3cubXNSZXF1ZXN0QW5pbWF0aW9uRnJhbWU7XG5cbmV4cG9ydHMuZnJhbWUgPSBmdW5jdGlvbihmbikge1xuICAgIHJldHVybiBmcmFtZShmbik7XG59O1xuXG5jb25zdCBjYW5jZWwgPSB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUgfHxcbiAgICB3aW5kb3cubW96Q2FuY2VsQW5pbWF0aW9uRnJhbWUgfHxcbiAgICB3aW5kb3cud2Via2l0Q2FuY2VsQW5pbWF0aW9uRnJhbWUgfHxcbiAgICB3aW5kb3cubXNDYW5jZWxBbmltYXRpb25GcmFtZTtcblxuZXhwb3J0cy5jYW5jZWxGcmFtZSA9IGZ1bmN0aW9uKGlkKSB7XG4gICAgY2FuY2VsKGlkKTtcbn07XG5cbmV4cG9ydHMudGltZWQgPSBmdW5jdGlvbiAoZm4sIGR1ciwgY3R4KSB7XG4gICAgaWYgKCFkdXIpIHtcbiAgICAgICAgZm4uY2FsbChjdHgsIDEpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBsZXQgYWJvcnQgPSBmYWxzZTtcbiAgICBjb25zdCBzdGFydCA9IG1vZHVsZS5leHBvcnRzLm5vdygpO1xuXG4gICAgZnVuY3Rpb24gdGljayhub3cpIHtcbiAgICAgICAgaWYgKGFib3J0KSByZXR1cm47XG4gICAgICAgIG5vdyA9IG1vZHVsZS5leHBvcnRzLm5vdygpO1xuXG4gICAgICAgIGlmIChub3cgPj0gc3RhcnQgKyBkdXIpIHtcbiAgICAgICAgICAgIGZuLmNhbGwoY3R4LCAxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZuLmNhbGwoY3R4LCAobm93IC0gc3RhcnQpIC8gZHVyKTtcbiAgICAgICAgICAgIGV4cG9ydHMuZnJhbWUodGljayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnRzLmZyYW1lKHRpY2spO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkgeyBhYm9ydCA9IHRydWU7IH07XG59O1xuXG5leHBvcnRzLmdldEltYWdlRGF0YSA9IGZ1bmN0aW9uIChpbWcpIHtcbiAgICBjb25zdCBjYW52YXMgPSB3aW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG4gICAgY29uc3QgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuICAgIGNhbnZhcy53aWR0aCA9IGltZy53aWR0aDtcbiAgICBjYW52YXMuaGVpZ2h0ID0gaW1nLmhlaWdodDtcbiAgICBjb250ZXh0LmRyYXdJbWFnZShpbWcsIDAsIDAsIGltZy53aWR0aCwgaW1nLmhlaWdodCk7XG4gICAgcmV0dXJuIGNvbnRleHQuZ2V0SW1hZ2VEYXRhKDAsIDAsIGltZy53aWR0aCwgaW1nLmhlaWdodCkuZGF0YTtcbn07XG5cbi8qKlxuICogVGVzdCBpZiB0aGUgY3VycmVudCBicm93c2VyIHN1cHBvcnRzIE1hcGJveCBHTCBKU1xuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMuZmFpbElmTWFqb3JQZXJmb3JtYW5jZUNhdmVhdD1mYWxzZV0gUmV0dXJuIGBmYWxzZWBcbiAqICAgaWYgdGhlIHBlcmZvcm1hbmNlIG9mIE1hcGJveCBHTCBKUyB3b3VsZCBiZSBkcmFtYXRpY2FsbHkgd29yc2UgdGhhblxuICogICBleHBlY3RlZCAoaS5lLiBhIHNvZnR3YXJlIHJlbmRlcmVyIHdvdWxkIGJlIHVzZWQpXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5leHBvcnRzLnN1cHBvcnRlZCA9IHJlcXVpcmUoJ21hcGJveC1nbC1zdXBwb3J0ZWQnKTtcblxuZXhwb3J0cy5oYXJkd2FyZUNvbmN1cnJlbmN5ID0gd2luZG93Lm5hdmlnYXRvci5oYXJkd2FyZUNvbmN1cnJlbmN5IHx8IDQ7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCAnZGV2aWNlUGl4ZWxSYXRpbycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gd2luZG93LmRldmljZVBpeGVsUmF0aW87IH1cbn0pO1xuXG5leHBvcnRzLnN1cHBvcnRzV2VicCA9IGZhbHNlO1xuXG5jb25zdCB3ZWJwSW1nVGVzdCA9IHdpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbWcnKTtcbndlYnBJbWdUZXN0Lm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgIGV4cG9ydHMuc3VwcG9ydHNXZWJwID0gdHJ1ZTtcbn07XG53ZWJwSW1nVGVzdC5zcmMgPSAnZGF0YTppbWFnZS93ZWJwO2Jhc2U2NCxVa2xHUmg0QUFBQlhSVUpRVmxBNFRCRUFBQUF2QVFBQUFBZlEvLzczdi8rQmlPaC9BQUE9JztcbiIsIid1c2Ugc3RyaWN0JztcblxuLyogZXNsaW50LWVudiBicm93c2VyICovXG5tb2R1bGUuZXhwb3J0cyA9IHNlbGY7XG4iLCIndXNlIHN0cmljdCc7XG5cbmNvbnN0IHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcblxuZnVuY3Rpb24gX2FkZEV2ZW50TGlzdGVuZXIodHlwZSwgbGlzdGVuZXIsIGxpc3RlbmVyTGlzdCkge1xuICAgIGxpc3RlbmVyTGlzdFt0eXBlXSA9IGxpc3RlbmVyTGlzdFt0eXBlXSB8fCBbXTtcbiAgICBsaXN0ZW5lckxpc3RbdHlwZV0ucHVzaChsaXN0ZW5lcik7XG59XG5cbmZ1bmN0aW9uIF9yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyLCBsaXN0ZW5lckxpc3QpIHtcbiAgICBpZiAobGlzdGVuZXJMaXN0ICYmIGxpc3RlbmVyTGlzdFt0eXBlXSkge1xuICAgICAgICBjb25zdCBpbmRleCA9IGxpc3RlbmVyTGlzdFt0eXBlXS5pbmRleE9mKGxpc3RlbmVyKTtcbiAgICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgbGlzdGVuZXJMaXN0W3R5cGVdLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogTWV0aG9kcyBtaXhlZCBpbiB0byBvdGhlciBjbGFzc2VzIGZvciBldmVudCBjYXBhYmlsaXRpZXMuXG4gKlxuICogQG1peGluIEV2ZW50ZWRcbiAqL1xuY2xhc3MgRXZlbnRlZCB7XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbGlzdGVuZXIgdG8gYSBzcGVjaWZpZWQgZXZlbnQgdHlwZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIFRoZSBldmVudCB0eXBlIHRvIGFkZCBhIGxpc3RlbiBmb3IuXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCB3aGVuIHRoZSBldmVudCBpcyBmaXJlZC5cbiAgICAgKiAgIFRoZSBsaXN0ZW5lciBmdW5jdGlvbiBpcyBjYWxsZWQgd2l0aCB0aGUgZGF0YSBvYmplY3QgcGFzc2VkIHRvIGBmaXJlYCxcbiAgICAgKiAgIGV4dGVuZGVkIHdpdGggYHRhcmdldGAgYW5kIGB0eXBlYCBwcm9wZXJ0aWVzLlxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IGB0aGlzYFxuICAgICAqL1xuICAgIG9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gICAgICAgIHRoaXMuX2xpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycyB8fCB7fTtcbiAgICAgICAgX2FkZEV2ZW50TGlzdGVuZXIodHlwZSwgbGlzdGVuZXIsIHRoaXMuX2xpc3RlbmVycyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhIHByZXZpb3VzbHkgcmVnaXN0ZXJlZCBldmVudCBsaXN0ZW5lci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIFRoZSBldmVudCB0eXBlIHRvIHJlbW92ZSBsaXN0ZW5lcnMgZm9yLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIFRoZSBsaXN0ZW5lciBmdW5jdGlvbiB0byByZW1vdmUuXG4gICAgICogQHJldHVybnMge09iamVjdH0gYHRoaXNgXG4gICAgICovXG4gICAgb2ZmKHR5cGUsIGxpc3RlbmVyKSB7XG4gICAgICAgIF9yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyLCB0aGlzLl9saXN0ZW5lcnMpO1xuICAgICAgICBfcmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lciwgdGhpcy5fb25lVGltZUxpc3RlbmVycyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIGxpc3RlbmVyIHRoYXQgd2lsbCBiZSBjYWxsZWQgb25seSBvbmNlIHRvIGEgc3BlY2lmaWVkIGV2ZW50IHR5cGUuXG4gICAgICpcbiAgICAgKiBUaGUgbGlzdGVuZXIgd2lsbCBiZSBjYWxsZWQgZmlyc3QgdGltZSB0aGUgZXZlbnQgZmlyZXMgYWZ0ZXIgdGhlIGxpc3RlbmVyIGlzIHJlZ2lzdGVyZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdHlwZSBUaGUgZXZlbnQgdHlwZSB0byBsaXN0ZW4gZm9yLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIFRoZSBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2hlbiB0aGUgZXZlbnQgaXMgZmlyZWQgdGhlIGZpcnN0IHRpbWUuXG4gICAgICogQHJldHVybnMge09iamVjdH0gYHRoaXNgXG4gICAgICovXG4gICAgb25jZSh0eXBlLCBsaXN0ZW5lcikge1xuICAgICAgICB0aGlzLl9vbmVUaW1lTGlzdGVuZXJzID0gdGhpcy5fb25lVGltZUxpc3RlbmVycyB8fCB7fTtcbiAgICAgICAgX2FkZEV2ZW50TGlzdGVuZXIodHlwZSwgbGlzdGVuZXIsIHRoaXMuX29uZVRpbWVMaXN0ZW5lcnMpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpcmVzIGFuIGV2ZW50IG9mIHRoZSBzcGVjaWZpZWQgdHlwZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIFRoZSB0eXBlIG9mIGV2ZW50IHRvIGZpcmUuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtkYXRhXSBEYXRhIHRvIGJlIHBhc3NlZCB0byBhbnkgbGlzdGVuZXJzLlxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IGB0aGlzYFxuICAgICAqL1xuICAgIGZpcmUodHlwZSwgZGF0YSkge1xuICAgICAgICBpZiAodGhpcy5saXN0ZW5zKHR5cGUpKSB7XG4gICAgICAgICAgICBkYXRhID0gdXRpbC5leHRlbmQoe30sIGRhdGEsIHt0eXBlOiB0eXBlLCB0YXJnZXQ6IHRoaXN9KTtcblxuICAgICAgICAgICAgLy8gbWFrZSBzdXJlIGFkZGluZyBvciByZW1vdmluZyBsaXN0ZW5lcnMgaW5zaWRlIG90aGVyIGxpc3RlbmVycyB3b24ndCBjYXVzZSBhbiBpbmZpbml0ZSBsb29wXG4gICAgICAgICAgICBjb25zdCBsaXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnMgJiYgdGhpcy5fbGlzdGVuZXJzW3R5cGVdID8gdGhpcy5fbGlzdGVuZXJzW3R5cGVdLnNsaWNlKCkgOiBbXTtcblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0ZW5lcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnNbaV0uY2FsbCh0aGlzLCBkYXRhKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgb25lVGltZUxpc3RlbmVycyA9IHRoaXMuX29uZVRpbWVMaXN0ZW5lcnMgJiYgdGhpcy5fb25lVGltZUxpc3RlbmVyc1t0eXBlXSA/IHRoaXMuX29uZVRpbWVMaXN0ZW5lcnNbdHlwZV0uc2xpY2UoKSA6IFtdO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG9uZVRpbWVMaXN0ZW5lcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBvbmVUaW1lTGlzdGVuZXJzW2ldLmNhbGwodGhpcywgZGF0YSk7XG4gICAgICAgICAgICAgICAgX3JlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgb25lVGltZUxpc3RlbmVyc1tpXSwgdGhpcy5fb25lVGltZUxpc3RlbmVycyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLl9ldmVudGVkUGFyZW50KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fZXZlbnRlZFBhcmVudC5maXJlKHR5cGUsIHV0aWwuZXh0ZW5kKHt9LCBkYXRhLCB0eXBlb2YgdGhpcy5fZXZlbnRlZFBhcmVudERhdGEgPT09ICdmdW5jdGlvbicgPyB0aGlzLl9ldmVudGVkUGFyZW50RGF0YSgpIDogdGhpcy5fZXZlbnRlZFBhcmVudERhdGEpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAvLyBUbyBlbnN1cmUgdGhhdCBubyBlcnJvciBldmVudHMgYXJlIGRyb3BwZWQsIHByaW50IHRoZW0gdG8gdGhlXG4gICAgICAgIC8vIGNvbnNvbGUgaWYgdGhleSBoYXZlIG5vIGxpc3RlbmVycy5cbiAgICAgICAgfSBlbHNlIGlmICh1dGlsLmVuZHNXaXRoKHR5cGUsICdlcnJvcicpKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKChkYXRhICYmIGRhdGEuZXJyb3IpIHx8IGRhdGEgfHwgJ0VtcHR5IGVycm9yIGV2ZW50Jyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgdHJ1ZSBpZiB0aGlzIGluc3RhbmNlIG9mIEV2ZW50ZWQgb3IgYW55IGZvcndhcmRlZWQgaW5zdGFuY2VzIG9mIEV2ZW50ZWQgaGF2ZSBhIGxpc3RlbmVyIGZvciB0aGUgc3BlY2lmaWVkIHR5cGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdHlwZSBUaGUgZXZlbnQgdHlwZVxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBgdHJ1ZWAgaWYgdGhlcmUgaXMgYXQgbGVhc3Qgb25lIHJlZ2lzdGVyZWQgbGlzdGVuZXIgZm9yIHNwZWNpZmllZCBldmVudCB0eXBlLCBgZmFsc2VgIG90aGVyd2lzZVxuICAgICAqL1xuICAgIGxpc3RlbnModHlwZSkge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgKHRoaXMuX2xpc3RlbmVycyAmJiB0aGlzLl9saXN0ZW5lcnNbdHlwZV0gJiYgdGhpcy5fbGlzdGVuZXJzW3R5cGVdLmxlbmd0aCA+IDApIHx8XG4gICAgICAgICAgICAodGhpcy5fb25lVGltZUxpc3RlbmVycyAmJiB0aGlzLl9vbmVUaW1lTGlzdGVuZXJzW3R5cGVdICYmIHRoaXMuX29uZVRpbWVMaXN0ZW5lcnNbdHlwZV0ubGVuZ3RoID4gMCkgfHxcbiAgICAgICAgICAgICh0aGlzLl9ldmVudGVkUGFyZW50ICYmIHRoaXMuX2V2ZW50ZWRQYXJlbnQubGlzdGVucyh0eXBlKSlcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBCdWJibGUgYWxsIGV2ZW50cyBmaXJlZCBieSB0aGlzIGluc3RhbmNlIG9mIEV2ZW50ZWQgdG8gdGhpcyBwYXJlbnQgaW5zdGFuY2Ugb2YgRXZlbnRlZC5cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtwYXJlbnR9XG4gICAgICogQHBhcmFtIHtkYXRhfVxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IGB0aGlzYFxuICAgICAqL1xuICAgIHNldEV2ZW50ZWRQYXJlbnQocGFyZW50LCBkYXRhKSB7XG4gICAgICAgIHRoaXMuX2V2ZW50ZWRQYXJlbnQgPSBwYXJlbnQ7XG4gICAgICAgIHRoaXMuX2V2ZW50ZWRQYXJlbnREYXRhID0gZGF0YTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRlZDtcbiIsIid1c2Ugc3RyaWN0Jztcbi8vICAgICAgXG5cbmNvbnN0IFVuaXRCZXppZXIgPSByZXF1aXJlKCdAbWFwYm94L3VuaXRiZXppZXInKTtcbmNvbnN0IENvb3JkaW5hdGUgPSByZXF1aXJlKCcuLi9nZW8vY29vcmRpbmF0ZScpO1xuY29uc3QgUG9pbnQgPSByZXF1aXJlKCdwb2ludC1nZW9tZXRyeScpO1xuXG4vKipcbiAqIEdpdmVuIGEgdmFsdWUgYHRgIHRoYXQgdmFyaWVzIGJldHdlZW4gMCBhbmQgMSwgcmV0dXJuXG4gKiBhbiBpbnRlcnBvbGF0aW9uIGZ1bmN0aW9uIHRoYXQgZWFzZXMgYmV0d2VlbiAwIGFuZCAxIGluIGEgcGxlYXNpbmdcbiAqIGN1YmljIGluLW91dCBmYXNoaW9uLlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMuZWFzZUN1YmljSW5PdXQgPSBmdW5jdGlvbih0ICAgICAgICApICAgICAgICAge1xuICAgIGlmICh0IDw9IDApIHJldHVybiAwO1xuICAgIGlmICh0ID49IDEpIHJldHVybiAxO1xuICAgIGNvbnN0IHQyID0gdCAqIHQsXG4gICAgICAgIHQzID0gdDIgKiB0O1xuICAgIHJldHVybiA0ICogKHQgPCAwLjUgPyB0MyA6IDMgKiAodCAtIHQyKSArIHQzIC0gMC43NSk7XG59O1xuXG4vKipcbiAqIEdpdmVuIGdpdmVuICh4LCB5KSwgKHgxLCB5MSkgY29udHJvbCBwb2ludHMgZm9yIGEgYmV6aWVyIGN1cnZlLFxuICogcmV0dXJuIGEgZnVuY3Rpb24gdGhhdCBpbnRlcnBvbGF0ZXMgYWxvbmcgdGhhdCBjdXJ2ZS5cbiAqXG4gKiBAcGFyYW0gcDF4IGNvbnRyb2wgcG9pbnQgMSB4IGNvb3JkaW5hdGVcbiAqIEBwYXJhbSBwMXkgY29udHJvbCBwb2ludCAxIHkgY29vcmRpbmF0ZVxuICogQHBhcmFtIHAyeCBjb250cm9sIHBvaW50IDIgeCBjb29yZGluYXRlXG4gKiBAcGFyYW0gcDJ5IGNvbnRyb2wgcG9pbnQgMiB5IGNvb3JkaW5hdGVcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMuYmV6aWVyID0gZnVuY3Rpb24ocDF4ICAgICAgICAsIHAxeSAgICAgICAgLCBwMnggICAgICAgICwgcDJ5ICAgICAgICApICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgIGNvbnN0IGJlemllciA9IG5ldyBVbml0QmV6aWVyKHAxeCwgcDF5LCBwMngsIHAyeSk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKHQgICAgICAgICkge1xuICAgICAgICByZXR1cm4gYmV6aWVyLnNvbHZlKHQpO1xuICAgIH07XG59O1xuXG4vKipcbiAqIEEgZGVmYXVsdCBiZXppZXItY3VydmUgcG93ZXJlZCBlYXNpbmcgZnVuY3Rpb24gd2l0aFxuICogY29udHJvbCBwb2ludHMgKDAuMjUsIDAuMSkgYW5kICgwLjI1LCAxKVxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMuZWFzZSA9IGV4cG9ydHMuYmV6aWVyKDAuMjUsIDAuMSwgMC4yNSwgMSk7XG5cbi8qKlxuICogY29uc3RyYWluIG4gdG8gdGhlIGdpdmVuIHJhbmdlIHZpYSBtaW4gKyBtYXhcbiAqXG4gKiBAcGFyYW0gbiB2YWx1ZVxuICogQHBhcmFtIG1pbiB0aGUgbWluaW11bSB2YWx1ZSB0byBiZSByZXR1cm5lZFxuICogQHBhcmFtIG1heCB0aGUgbWF4aW11bSB2YWx1ZSB0byBiZSByZXR1cm5lZFxuICogQHJldHVybnMgdGhlIGNsYW1wZWQgdmFsdWVcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMuY2xhbXAgPSBmdW5jdGlvbiAobiAgICAgICAgLCBtaW4gICAgICAgICwgbWF4ICAgICAgICApICAgICAgICAge1xuICAgIHJldHVybiBNYXRoLm1pbihtYXgsIE1hdGgubWF4KG1pbiwgbikpO1xufTtcblxuLyoqXG4gKiBjb25zdHJhaW4gbiB0byB0aGUgZ2l2ZW4gcmFuZ2UsIGV4Y2x1ZGluZyB0aGUgbWluaW11bSwgdmlhIG1vZHVsYXIgYXJpdGhtZXRpY1xuICpcbiAqIEBwYXJhbSBuIHZhbHVlXG4gKiBAcGFyYW0gbWluIHRoZSBtaW5pbXVtIHZhbHVlIHRvIGJlIHJldHVybmVkLCBleGNsdXNpdmVcbiAqIEBwYXJhbSBtYXggdGhlIG1heGltdW0gdmFsdWUgdG8gYmUgcmV0dXJuZWQsIGluY2x1c2l2ZVxuICogQHJldHVybnMgY29uc3RyYWluZWQgbnVtYmVyXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnRzLndyYXAgPSBmdW5jdGlvbiAobiAgICAgICAgLCBtaW4gICAgICAgICwgbWF4ICAgICAgICApICAgICAgICAge1xuICAgIGNvbnN0IGQgPSBtYXggLSBtaW47XG4gICAgY29uc3QgdyA9ICgobiAtIG1pbikgJSBkICsgZCkgJSBkICsgbWluO1xuICAgIHJldHVybiAodyA9PT0gbWluKSA/IG1heCA6IHc7XG59O1xuXG4vKlxuICogQ2FsbCBhbiBhc3luY2hyb25vdXMgZnVuY3Rpb24gb24gYW4gYXJyYXkgb2YgYXJndW1lbnRzLFxuICogY2FsbGluZyBgY2FsbGJhY2tgIHdpdGggdGhlIGNvbXBsZXRlZCByZXN1bHRzIG9mIGFsbCBjYWxscy5cbiAqXG4gKiBAcGFyYW0gYXJyYXkgaW5wdXQgdG8gZWFjaCBjYWxsIG9mIHRoZSBhc3luYyBmdW5jdGlvbi5cbiAqIEBwYXJhbSBmbiBhbiBhc3luYyBmdW5jdGlvbiB3aXRoIHNpZ25hdHVyZSAoZGF0YSwgY2FsbGJhY2spXG4gKiBAcGFyYW0gY2FsbGJhY2sgYSBjYWxsYmFjayBydW4gYWZ0ZXIgYWxsIGFzeW5jIHdvcmsgaXMgZG9uZS5cbiAqIGNhbGxlZCB3aXRoIGFuIGFycmF5LCBjb250YWluaW5nIHRoZSByZXN1bHRzIG9mIGVhY2ggYXN5bmMgY2FsbC5cbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMuYXN5bmNBbGwgPSBmdW5jdGlvbiAoYXJyYXkgICAgICAgICAgICAsIGZuICAgICAgICAgICwgY2FsbGJhY2sgICAgICAgICAgKSB7XG4gICAgaWYgKCFhcnJheS5sZW5ndGgpIHsgcmV0dXJuIGNhbGxiYWNrKG51bGwsIFtdKTsgfVxuICAgIGxldCByZW1haW5pbmcgPSBhcnJheS5sZW5ndGg7XG4gICAgY29uc3QgcmVzdWx0cyA9IG5ldyBBcnJheShhcnJheS5sZW5ndGgpO1xuICAgIGxldCBlcnJvciA9IG51bGw7XG4gICAgYXJyYXkuZm9yRWFjaCgoaXRlbSwgaSkgPT4ge1xuICAgICAgICBmbihpdGVtLCAoZXJyLCByZXN1bHQpID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIpIGVycm9yID0gZXJyO1xuICAgICAgICAgICAgcmVzdWx0c1tpXSA9IHJlc3VsdDtcbiAgICAgICAgICAgIGlmICgtLXJlbWFpbmluZyA9PT0gMCkgY2FsbGJhY2soZXJyb3IsIHJlc3VsdHMpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn07XG5cbi8qXG4gKiBQb2x5ZmlsbCBmb3IgT2JqZWN0LnZhbHVlcy4gTm90IGZ1bGx5IHNwZWMgY29tcGxpYW50LCBidXQgd2UgZG9uJ3RcbiAqIG5lZWQgaXQgdG8gYmUuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0cy52YWx1ZXMgPSBmdW5jdGlvbiAob2JqICAgICAgICApICAgICAgICAgICAgICAgIHtcbiAgICBjb25zdCByZXN1bHQgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGsgaW4gb2JqKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKG9ialtrXSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKlxuICogQ29tcHV0ZSB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIHRoZSBrZXlzIGluIG9uZSBvYmplY3QgYW5kIHRoZSBrZXlzXG4gKiBpbiBhbm90aGVyIG9iamVjdC5cbiAqXG4gKiBAcmV0dXJucyBrZXlzIGRpZmZlcmVuY2VcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMua2V5c0RpZmZlcmVuY2UgPSBmdW5jdGlvbiAob2JqICAgICAgICAsIG90aGVyICAgICAgICApICAgICAgICAgICAgICAgIHtcbiAgICBjb25zdCBkaWZmZXJlbmNlID0gW107XG4gICAgZm9yIChjb25zdCBpIGluIG9iaikge1xuICAgICAgICBpZiAoIShpIGluIG90aGVyKSkge1xuICAgICAgICAgICAgZGlmZmVyZW5jZS5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkaWZmZXJlbmNlO1xufTtcblxuLyoqXG4gKiBHaXZlbiBhIGRlc3RpbmF0aW9uIG9iamVjdCBhbmQgb3B0aW9uYWxseSBtYW55IHNvdXJjZSBvYmplY3RzLFxuICogY29weSBhbGwgcHJvcGVydGllcyBmcm9tIHRoZSBzb3VyY2Ugb2JqZWN0cyBpbnRvIHRoZSBkZXN0aW5hdGlvbi5cbiAqIFRoZSBsYXN0IHNvdXJjZSBvYmplY3QgZ2l2ZW4gb3ZlcnJpZGVzIHByb3BlcnRpZXMgZnJvbSBwcmV2aW91c1xuICogc291cmNlIG9iamVjdHMuXG4gKlxuICogQHBhcmFtIGRlc3QgZGVzdGluYXRpb24gb2JqZWN0XG4gKiBAcGFyYW0gey4uLk9iamVjdH0gc291cmNlcyBzb3VyY2VzIGZyb20gd2hpY2ggcHJvcGVydGllcyBhcmUgcHVsbGVkXG4gKiBAcHJpdmF0ZVxuICovXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdW51c2VkLXZhcnNcbmV4cG9ydHMuZXh0ZW5kID0gZnVuY3Rpb24gKGRlc3QgICAgICAgICwgc291cmNlMCAgICAgICAgLCBzb3VyY2UxICAgICAgICAgLCBzb3VyY2UyICAgICAgICAgKSAgICAgICAgIHtcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBzcmMgPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGZvciAoY29uc3QgayBpbiBzcmMpIHtcbiAgICAgICAgICAgIGRlc3Rba10gPSBzcmNba107XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGRlc3Q7XG59O1xuXG4vKipcbiAqIEdpdmVuIGFuIG9iamVjdCBhbmQgYSBudW1iZXIgb2YgcHJvcGVydGllcyBhcyBzdHJpbmdzLCByZXR1cm4gdmVyc2lvblxuICogb2YgdGhhdCBvYmplY3Qgd2l0aCBvbmx5IHRob3NlIHByb3BlcnRpZXMuXG4gKlxuICogQHBhcmFtIHNyYyB0aGUgb2JqZWN0XG4gKiBAcGFyYW0gcHJvcGVydGllcyBhbiBhcnJheSBvZiBwcm9wZXJ0eSBuYW1lcyBjaG9zZW5cbiAqIHRvIGFwcGVhciBvbiB0aGUgcmVzdWx0aW5nIG9iamVjdC5cbiAqIEByZXR1cm5zIG9iamVjdCB3aXRoIGxpbWl0ZWQgcHJvcGVydGllcy5cbiAqIEBleGFtcGxlXG4gKiB2YXIgZm9vID0geyBuYW1lOiAnQ2hhcmxpZScsIGFnZTogMTAgfTtcbiAqIHZhciBqdXN0TmFtZSA9IHBpY2soZm9vLCBbJ25hbWUnXSk7XG4gKiAvLyBqdXN0TmFtZSA9IHsgbmFtZTogJ0NoYXJsaWUnIH1cbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMucGljayA9IGZ1bmN0aW9uIChzcmMgICAgICAgICwgcHJvcGVydGllcyAgICAgICAgICAgICAgICkgICAgICAgICB7XG4gICAgY29uc3QgcmVzdWx0ID0ge307XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwcm9wZXJ0aWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGsgPSBwcm9wZXJ0aWVzW2ldO1xuICAgICAgICBpZiAoayBpbiBzcmMpIHtcbiAgICAgICAgICAgIHJlc3VsdFtrXSA9IHNyY1trXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxubGV0IGlkID0gMTtcblxuLyoqXG4gKiBSZXR1cm4gYSB1bmlxdWUgbnVtZXJpYyBpZCwgc3RhcnRpbmcgYXQgMSBhbmQgaW5jcmVtZW50aW5nIHdpdGhcbiAqIGVhY2ggY2FsbC5cbiAqXG4gKiBAcmV0dXJucyB1bmlxdWUgbnVtZXJpYyBpZC5cbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMudW5pcXVlSWQgPSBmdW5jdGlvbiAoKSAgICAgICAgIHtcbiAgICByZXR1cm4gaWQrKztcbn07XG5cbi8qKlxuICogR2l2ZW4gYW4gYXJyYXkgb2YgbWVtYmVyIGZ1bmN0aW9uIG5hbWVzIGFzIHN0cmluZ3MsIHJlcGxhY2UgYWxsIG9mIHRoZW1cbiAqIHdpdGggYm91bmQgdmVyc2lvbnMgdGhhdCB3aWxsIGFsd2F5cyByZWZlciB0byBgY29udGV4dGAgYXMgYHRoaXNgLiBUaGlzXG4gKiBpcyB1c2VmdWwgZm9yIGNsYXNzZXMgd2hlcmUgb3RoZXJ3aXNlIGV2ZW50IGJpbmRpbmdzIHdvdWxkIHJlYXNzaWduXG4gKiBgdGhpc2AgdG8gdGhlIGV2ZW50ZWQgb2JqZWN0IG9yIHNvbWUgb3RoZXIgdmFsdWU6IHRoaXMgbGV0cyB5b3UgZW5zdXJlXG4gKiB0aGUgYHRoaXNgIHZhbHVlIGFsd2F5cy5cbiAqXG4gKiBAcGFyYW0gZm5zIGxpc3Qgb2YgbWVtYmVyIGZ1bmN0aW9uIG5hbWVzXG4gKiBAcGFyYW0gY29udGV4dCB0aGUgY29udGV4dCB2YWx1ZVxuICogQGV4YW1wbGVcbiAqIGZ1bmN0aW9uIE15Q2xhc3MoKSB7XG4gKiAgIGJpbmRBbGwoWydvbnRpbWVyJ10sIHRoaXMpO1xuICogICB0aGlzLm5hbWUgPSAnVG9tJztcbiAqIH1cbiAqIE15Q2xhc3MucHJvdG90eXBlLm9udGltZXIgPSBmdW5jdGlvbigpIHtcbiAqICAgYWxlcnQodGhpcy5uYW1lKTtcbiAqIH07XG4gKiB2YXIgbXlDbGFzcyA9IG5ldyBNeUNsYXNzKCk7XG4gKiBzZXRUaW1lb3V0KG15Q2xhc3Mub250aW1lciwgMTAwKTtcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMuYmluZEFsbCA9IGZ1bmN0aW9uKGZucyAgICAgICAgICAgICAgICwgY29udGV4dCAgICAgICAgKSAgICAgICB7XG4gICAgZm5zLmZvckVhY2goKGZuKSA9PiB7XG4gICAgICAgIGlmICghY29udGV4dFtmbl0pIHsgcmV0dXJuOyB9XG4gICAgICAgIGNvbnRleHRbZm5dID0gY29udGV4dFtmbl0uYmluZChjb250ZXh0KTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogR2l2ZW4gYSBsaXN0IG9mIGNvb3JkaW5hdGVzLCBnZXQgdGhlaXIgY2VudGVyIGFzIGEgY29vcmRpbmF0ZS5cbiAqXG4gKiBAcmV0dXJucyBjZW50ZXJwb2ludFxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0cy5nZXRDb29yZGluYXRlc0NlbnRlciA9IGZ1bmN0aW9uKGNvb3JkcyAgICAgICAgICAgICAgICAgICApICAgICAgICAgICAgIHtcbiAgICBsZXQgbWluWCA9IEluZmluaXR5O1xuICAgIGxldCBtaW5ZID0gSW5maW5pdHk7XG4gICAgbGV0IG1heFggPSAtSW5maW5pdHk7XG4gICAgbGV0IG1heFkgPSAtSW5maW5pdHk7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvb3Jkcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgY29vcmRzW2ldLmNvbHVtbik7XG4gICAgICAgIG1pblkgPSBNYXRoLm1pbihtaW5ZLCBjb29yZHNbaV0ucm93KTtcbiAgICAgICAgbWF4WCA9IE1hdGgubWF4KG1heFgsIGNvb3Jkc1tpXS5jb2x1bW4pO1xuICAgICAgICBtYXhZID0gTWF0aC5tYXgobWF4WSwgY29vcmRzW2ldLnJvdyk7XG4gICAgfVxuXG4gICAgY29uc3QgZHggPSBtYXhYIC0gbWluWDtcbiAgICBjb25zdCBkeSA9IG1heFkgLSBtaW5ZO1xuICAgIGNvbnN0IGRNYXggPSBNYXRoLm1heChkeCwgZHkpO1xuICAgIGNvbnN0IHpvb20gPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKC1NYXRoLmxvZyhkTWF4KSAvIE1hdGguTE4yKSk7XG4gICAgcmV0dXJuIG5ldyBDb29yZGluYXRlKChtaW5YICsgbWF4WCkgLyAyLCAobWluWSArIG1heFkpIC8gMiwgMClcbiAgICAgICAgLnpvb21Ubyh6b29tKTtcbn07XG5cbi8qKlxuICogRGV0ZXJtaW5lIGlmIGEgc3RyaW5nIGVuZHMgd2l0aCBhIHBhcnRpY3VsYXIgc3Vic3RyaW5nXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0cy5lbmRzV2l0aCA9IGZ1bmN0aW9uKHN0cmluZyAgICAgICAgLCBzdWZmaXggICAgICAgICkgICAgICAgICAge1xuICAgIHJldHVybiBzdHJpbmcuaW5kZXhPZihzdWZmaXgsIHN0cmluZy5sZW5ndGggLSBzdWZmaXgubGVuZ3RoKSAhPT0gLTE7XG59O1xuXG4vKipcbiAqIENyZWF0ZSBhbiBvYmplY3QgYnkgbWFwcGluZyBhbGwgdGhlIHZhbHVlcyBvZiBhbiBleGlzdGluZyBvYmplY3Qgd2hpbGVcbiAqIHByZXNlcnZpbmcgdGhlaXIga2V5cy5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnRzLm1hcE9iamVjdCA9IGZ1bmN0aW9uKGlucHV0ICAgICAgICAsIGl0ZXJhdG9yICAgICAgICAgICwgY29udGV4dCAgICAgICAgICkgICAgICAgICB7XG4gICAgY29uc3Qgb3V0cHV0ID0ge307XG4gICAgZm9yIChjb25zdCBrZXkgaW4gaW5wdXQpIHtcbiAgICAgICAgb3V0cHV0W2tleV0gPSBpdGVyYXRvci5jYWxsKGNvbnRleHQgfHwgdGhpcywgaW5wdXRba2V5XSwga2V5LCBpbnB1dCk7XG4gICAgfVxuICAgIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIENyZWF0ZSBhbiBvYmplY3QgYnkgZmlsdGVyaW5nIG91dCB2YWx1ZXMgb2YgYW4gZXhpc3Rpbmcgb2JqZWN0LlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMuZmlsdGVyT2JqZWN0ID0gZnVuY3Rpb24oaW5wdXQgICAgICAgICwgaXRlcmF0b3IgICAgICAgICAgLCBjb250ZXh0ICAgICAgICAgKSAgICAgICAgIHtcbiAgICBjb25zdCBvdXRwdXQgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBpbnB1dCkge1xuICAgICAgICBpZiAoaXRlcmF0b3IuY2FsbChjb250ZXh0IHx8IHRoaXMsIGlucHV0W2tleV0sIGtleSwgaW5wdXQpKSB7XG4gICAgICAgICAgICBvdXRwdXRba2V5XSA9IGlucHV0W2tleV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG91dHB1dDtcbn07XG5cbi8qKlxuICogRGVlcGx5IGNvbXBhcmVzIHR3byBvYmplY3QgbGl0ZXJhbHMuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0cy5kZWVwRXF1YWwgPSBmdW5jdGlvbihhICAgICAgICAsIGIgICAgICAgICkgICAgICAgICAge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGEpKSB7XG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShiKSB8fCBhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoIWV4cG9ydHMuZGVlcEVxdWFsKGFbaV0sIGJbaV0pKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgYSA9PT0gJ29iamVjdCcgJiYgYSAhPT0gbnVsbCAmJiBiICE9PSBudWxsKSB7XG4gICAgICAgIGlmICghKHR5cGVvZiBiID09PSAnb2JqZWN0JykpIHJldHVybiBmYWxzZTtcbiAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKGEpO1xuICAgICAgICBpZiAoa2V5cy5sZW5ndGggIT09IE9iamVjdC5rZXlzKGIpLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBhKSB7XG4gICAgICAgICAgICBpZiAoIWV4cG9ydHMuZGVlcEVxdWFsKGFba2V5XSwgYltrZXldKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gYSA9PT0gYjtcbn07XG5cbi8qKlxuICogRGVlcGx5IGNsb25lcyB0d28gb2JqZWN0cy5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnRzLmNsb25lID0gZnVuY3Rpb24gICAoaW5wdXQgICApICAgIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShpbnB1dCkpIHtcbiAgICAgICAgcmV0dXJuIGlucHV0Lm1hcChleHBvcnRzLmNsb25lKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBpbnB1dCA9PT0gJ29iamVjdCcgJiYgaW5wdXQpIHtcbiAgICAgICAgcmV0dXJuICgoZXhwb3J0cy5tYXBPYmplY3QoaW5wdXQsIGV4cG9ydHMuY2xvbmUpICAgICApICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gaW5wdXQ7XG4gICAgfVxufTtcblxuLyoqXG4gKiBDaGVjayBpZiB0d28gYXJyYXlzIGhhdmUgYXQgbGVhc3Qgb25lIGNvbW1vbiBlbGVtZW50LlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydHMuYXJyYXlzSW50ZXJzZWN0ID0gZnVuY3Rpb24oYSAgICAgICAgICAgICwgYiAgICAgICAgICAgICkgICAgICAgICAge1xuICAgIGZvciAobGV0IGwgPSAwOyBsIDwgYS5sZW5ndGg7IGwrKykge1xuICAgICAgICBpZiAoYi5pbmRleE9mKGFbbF0pID49IDApIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuXG4vKipcbiAqIFByaW50IGEgd2FybmluZyBtZXNzYWdlIHRvIHRoZSBjb25zb2xlIGFuZCBlbnN1cmUgZHVwbGljYXRlIHdhcm5pbmcgbWVzc2FnZXNcbiAqIGFyZSBub3QgcHJpbnRlZC5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5jb25zdCB3YXJuT25jZUhpc3RvcnkgPSB7fTtcbmV4cG9ydHMud2Fybk9uY2UgPSBmdW5jdGlvbihtZXNzYWdlICAgICAgICApICAgICAgIHtcbiAgICBpZiAoIXdhcm5PbmNlSGlzdG9yeVttZXNzYWdlXSkge1xuICAgICAgICAvLyBjb25zb2xlIGlzbid0IGRlZmluZWQgaW4gc29tZSBXZWJXb3JrZXJzLCBzZWUgIzI1NThcbiAgICAgICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSBcInVuZGVmaW5lZFwiKSBjb25zb2xlLndhcm4obWVzc2FnZSk7XG4gICAgICAgIHdhcm5PbmNlSGlzdG9yeVttZXNzYWdlXSA9IHRydWU7XG4gICAgfVxufTtcblxuLyoqXG4gKiBJbmRpY2F0ZXMgaWYgdGhlIHByb3ZpZGVkIFBvaW50cyBhcmUgaW4gYSBjb3VudGVyIGNsb2Nrd2lzZSAodHJ1ZSkgb3IgY2xvY2t3aXNlIChmYWxzZSkgb3JkZXJcbiAqXG4gKiBAcmV0dXJucyB0cnVlIGZvciBhIGNvdW50ZXIgY2xvY2t3aXNlIHNldCBvZiBwb2ludHNcbiAqL1xuLy8gaHR0cDovL2JyeWNlYm9lLmNvbS8yMDA2LzEwLzIzL2xpbmUtc2VnbWVudC1pbnRlcnNlY3Rpb24tYWxnb3JpdGhtL1xuZXhwb3J0cy5pc0NvdW50ZXJDbG9ja3dpc2UgPSBmdW5jdGlvbihhICAgICAgICwgYiAgICAgICAsIGMgICAgICAgKSAgICAgICAgICB7XG4gICAgcmV0dXJuIChjLnkgLSBhLnkpICogKGIueCAtIGEueCkgPiAoYi55IC0gYS55KSAqIChjLnggLSBhLngpO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBzaWduZWQgYXJlYSBmb3IgdGhlIHBvbHlnb24gcmluZy4gIFBvc3RpdmUgYXJlYXMgYXJlIGV4dGVyaW9yIHJpbmdzIGFuZFxuICogaGF2ZSBhIGNsb2Nrd2lzZSB3aW5kaW5nLiAgTmVnYXRpdmUgYXJlYXMgYXJlIGludGVyaW9yIHJpbmdzIGFuZCBoYXZlIGEgY291bnRlciBjbG9ja3dpc2VcbiAqIG9yZGVyaW5nLlxuICpcbiAqIEBwYXJhbSByaW5nIEV4dGVyaW9yIG9yIGludGVyaW9yIHJpbmdcbiAqL1xuZXhwb3J0cy5jYWxjdWxhdGVTaWduZWRBcmVhID0gZnVuY3Rpb24ocmluZyAgICAgICAgICAgICAgKSAgICAgICAgIHtcbiAgICBsZXQgc3VtID0gMDtcbiAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gcmluZy5sZW5ndGgsIGogPSBsZW4gLSAxLCBwMSwgcDI7IGkgPCBsZW47IGogPSBpKyspIHtcbiAgICAgICAgcDEgPSByaW5nW2ldO1xuICAgICAgICBwMiA9IHJpbmdbal07XG4gICAgICAgIHN1bSArPSAocDIueCAtIHAxLngpICogKHAxLnkgKyBwMi55KTtcbiAgICB9XG4gICAgcmV0dXJuIHN1bTtcbn07XG5cbi8qKlxuICogRGV0ZWN0cyBjbG9zZWQgcG9seWdvbnMsIGZpcnN0ICsgbGFzdCBwb2ludCBhcmUgZXF1YWxcbiAqXG4gKiBAcGFyYW0gcG9pbnRzIGFycmF5IG9mIHBvaW50c1xuICogQHJldHVybiB0cnVlIGlmIHRoZSBwb2ludHMgYXJlIGEgY2xvc2VkIHBvbHlnb25cbiAqL1xuZXhwb3J0cy5pc0Nsb3NlZFBvbHlnb24gPSBmdW5jdGlvbihwb2ludHMgICAgICAgICAgICAgICkgICAgICAgICAge1xuICAgIC8vIElmIGl0IGlzIDIgcG9pbnRzIHRoYXQgYXJlIHRoZSBzYW1lIHRoZW4gaXQgaXMgYSBwb2ludFxuICAgIC8vIElmIGl0IGlzIDMgcG9pbnRzIHdpdGggc3RhcnQgYW5kIGVuZCB0aGUgc2FtZSB0aGVuIGl0IGlzIGEgbGluZVxuICAgIGlmIChwb2ludHMubGVuZ3RoIDwgNClcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgY29uc3QgcDEgPSBwb2ludHNbMF07XG4gICAgY29uc3QgcDIgPSBwb2ludHNbcG9pbnRzLmxlbmd0aCAtIDFdO1xuXG4gICAgaWYgKE1hdGguYWJzKHAxLnggLSBwMi54KSA+IDAgfHxcbiAgICAgICAgTWF0aC5hYnMocDEueSAtIHAyLnkpID4gMCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gcG9seWdvbiBzaW1wbGlmaWNhdGlvbiBjYW4gcHJvZHVjZSBwb2x5Z29ucyB3aXRoIHplcm8gYXJlYSBhbmQgbW9yZSB0aGFuIDMgcG9pbnRzXG4gICAgcmV0dXJuIChNYXRoLmFicyhleHBvcnRzLmNhbGN1bGF0ZVNpZ25lZEFyZWEocG9pbnRzKSkgPiAwLjAxKTtcbn07XG5cbi8qKlxuICogQ29udmVydHMgc3BoZXJpY2FsIGNvb3JkaW5hdGVzIHRvIGNhcnRlc2lhbiBjb29yZGluYXRlcy5cbiAqXG4gKiBAcGFyYW0gc3BoZXJpY2FsIFNwaGVyaWNhbCBjb29yZGluYXRlcywgaW4gW3JhZGlhbCwgYXppbXV0aGFsLCBwb2xhcl1cbiAqIEByZXR1cm4gY2FydGVzaWFuIGNvb3JkaW5hdGVzIGluIFt4LCB5LCB6XVxuICovXG5cbmV4cG9ydHMuc3BoZXJpY2FsVG9DYXJ0ZXNpYW4gPSBmdW5jdGlvbihzcGhlcmljYWwgICAgICAgICAgICAgICApICAgICAgICAgICAgICAgIHtcbiAgICBjb25zdCByID0gc3BoZXJpY2FsWzBdO1xuICAgIGxldCBhemltdXRoYWwgPSBzcGhlcmljYWxbMV0sXG4gICAgICAgIHBvbGFyID0gc3BoZXJpY2FsWzJdO1xuICAgIC8vIFdlIGFic3RyYWN0IFwibm9ydGhcIi9cInVwXCIgKGNvbXBhc3Mtd2lzZSkgdG8gYmUgMMKwIHdoZW4gcmVhbGx5IHRoaXMgaXMgOTDCsCAoz4AvMik6XG4gICAgLy8gY29ycmVjdCBmb3IgdGhhdCBoZXJlXG4gICAgYXppbXV0aGFsICs9IDkwO1xuXG4gICAgLy8gQ29udmVydCBhemltdXRoYWwgYW5kIHBvbGFyIGFuZ2xlcyB0byByYWRpYW5zXG4gICAgYXppbXV0aGFsICo9IE1hdGguUEkgLyAxODA7XG4gICAgcG9sYXIgKj0gTWF0aC5QSSAvIDE4MDtcblxuICAgIC8vIHNwaGVyaWNhbCB0byBjYXJ0ZXNpYW4gKHgsIHksIHopXG4gICAgcmV0dXJuIFtcbiAgICAgICAgciAqIE1hdGguY29zKGF6aW11dGhhbCkgKiBNYXRoLnNpbihwb2xhciksXG4gICAgICAgIHIgKiBNYXRoLnNpbihhemltdXRoYWwpICogTWF0aC5zaW4ocG9sYXIpLFxuICAgICAgICByICogTWF0aC5jb3MocG9sYXIpXG4gICAgXTtcbn07XG5cbi8qKlxuICogUGFyc2VzIGRhdGEgZnJvbSAnQ2FjaGUtQ29udHJvbCcgaGVhZGVycy5cbiAqXG4gKiBAcGFyYW0gY2FjaGVDb250cm9sIFZhbHVlIG9mICdDYWNoZS1Db250cm9sJyBoZWFkZXJcbiAqIEByZXR1cm4gb2JqZWN0IGNvbnRhaW5pbmcgcGFyc2VkIGhlYWRlciBpbmZvLlxuICovXG5cbmV4cG9ydHMucGFyc2VDYWNoZUNvbnRyb2wgPSBmdW5jdGlvbihjYWNoZUNvbnRyb2wgICAgICAgICkgICAgICAgICB7XG4gICAgLy8gVGFrZW4gZnJvbSBbV3JlY2tdKGh0dHBzOi8vZ2l0aHViLmNvbS9oYXBpanMvd3JlY2spXG4gICAgY29uc3QgcmUgPSAvKD86XnwoPzpcXHMqXFwsXFxzKikpKFteXFx4MDAtXFx4MjBcXChcXCk8PkBcXCw7XFw6XFxcXFwiXFwvXFxbXFxdXFw/XFw9XFx7XFx9XFx4N0ZdKykoPzpcXD0oPzooW15cXHgwMC1cXHgyMFxcKFxcKTw+QFxcLDtcXDpcXFxcXCJcXC9cXFtcXF1cXD9cXD1cXHtcXH1cXHg3Rl0rKXwoPzpcXFwiKCg/OlteXCJcXFxcXXxcXFxcLikqKVxcXCIpKSk/L2c7XG5cbiAgICBjb25zdCBoZWFkZXIgPSB7fTtcbiAgICBjYWNoZUNvbnRyb2wucmVwbGFjZShyZSwgKCQwLCAkMSwgJDIsICQzKSA9PiB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gJDIgfHwgJDM7XG4gICAgICAgIGhlYWRlclskMV0gPSB2YWx1ZSA/IHZhbHVlLnRvTG93ZXJDYXNlKCkgOiB0cnVlO1xuICAgICAgICByZXR1cm4gJyc7XG4gICAgfSk7XG5cbiAgICBpZiAoaGVhZGVyWydtYXgtYWdlJ10pIHtcbiAgICAgICAgY29uc3QgbWF4QWdlID0gcGFyc2VJbnQoaGVhZGVyWydtYXgtYWdlJ10sIDEwKTtcbiAgICAgICAgaWYgKGlzTmFOKG1heEFnZSkpIGRlbGV0ZSBoZWFkZXJbJ21heC1hZ2UnXTtcbiAgICAgICAgZWxzZSBoZWFkZXJbJ21heC1hZ2UnXSA9IG1heEFnZTtcbiAgICB9XG5cbiAgICByZXR1cm4gaGVhZGVyO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBQb2ludDtcblxuZnVuY3Rpb24gUG9pbnQoeCwgeSkge1xuICAgIHRoaXMueCA9IHg7XG4gICAgdGhpcy55ID0geTtcbn1cblxuUG9pbnQucHJvdG90eXBlID0ge1xuICAgIGNsb25lOiBmdW5jdGlvbigpIHsgcmV0dXJuIG5ldyBQb2ludCh0aGlzLngsIHRoaXMueSk7IH0sXG5cbiAgICBhZGQ6ICAgICBmdW5jdGlvbihwKSB7IHJldHVybiB0aGlzLmNsb25lKCkuX2FkZChwKTsgICAgIH0sXG4gICAgc3ViOiAgICAgZnVuY3Rpb24ocCkgeyByZXR1cm4gdGhpcy5jbG9uZSgpLl9zdWIocCk7ICAgICB9LFxuICAgIG11bHQ6ICAgIGZ1bmN0aW9uKGspIHsgcmV0dXJuIHRoaXMuY2xvbmUoKS5fbXVsdChrKTsgICAgfSxcbiAgICBkaXY6ICAgICBmdW5jdGlvbihrKSB7IHJldHVybiB0aGlzLmNsb25lKCkuX2RpdihrKTsgICAgIH0sXG4gICAgcm90YXRlOiAgZnVuY3Rpb24oYSkgeyByZXR1cm4gdGhpcy5jbG9uZSgpLl9yb3RhdGUoYSk7ICB9LFxuICAgIG1hdE11bHQ6IGZ1bmN0aW9uKG0pIHsgcmV0dXJuIHRoaXMuY2xvbmUoKS5fbWF0TXVsdChtKTsgfSxcbiAgICB1bml0OiAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuY2xvbmUoKS5fdW5pdCgpOyB9LFxuICAgIHBlcnA6ICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5jbG9uZSgpLl9wZXJwKCk7IH0sXG4gICAgcm91bmQ6ICAgZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmNsb25lKCkuX3JvdW5kKCk7IH0sXG5cbiAgICBtYWc6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gTWF0aC5zcXJ0KHRoaXMueCAqIHRoaXMueCArIHRoaXMueSAqIHRoaXMueSk7XG4gICAgfSxcblxuICAgIGVxdWFsczogZnVuY3Rpb24ocCkge1xuICAgICAgICByZXR1cm4gdGhpcy54ID09PSBwLnggJiZcbiAgICAgICAgICAgICAgIHRoaXMueSA9PT0gcC55O1xuICAgIH0sXG5cbiAgICBkaXN0OiBmdW5jdGlvbihwKSB7XG4gICAgICAgIHJldHVybiBNYXRoLnNxcnQodGhpcy5kaXN0U3FyKHApKTtcbiAgICB9LFxuXG4gICAgZGlzdFNxcjogZnVuY3Rpb24ocCkge1xuICAgICAgICB2YXIgZHggPSBwLnggLSB0aGlzLngsXG4gICAgICAgICAgICBkeSA9IHAueSAtIHRoaXMueTtcbiAgICAgICAgcmV0dXJuIGR4ICogZHggKyBkeSAqIGR5O1xuICAgIH0sXG5cbiAgICBhbmdsZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBNYXRoLmF0YW4yKHRoaXMueSwgdGhpcy54KTtcbiAgICB9LFxuXG4gICAgYW5nbGVUbzogZnVuY3Rpb24oYikge1xuICAgICAgICByZXR1cm4gTWF0aC5hdGFuMih0aGlzLnkgLSBiLnksIHRoaXMueCAtIGIueCk7XG4gICAgfSxcblxuICAgIGFuZ2xlV2l0aDogZnVuY3Rpb24oYikge1xuICAgICAgICByZXR1cm4gdGhpcy5hbmdsZVdpdGhTZXAoYi54LCBiLnkpO1xuICAgIH0sXG5cbiAgICAvLyBGaW5kIHRoZSBhbmdsZSBvZiB0aGUgdHdvIHZlY3RvcnMsIHNvbHZpbmcgdGhlIGZvcm11bGEgZm9yIHRoZSBjcm9zcyBwcm9kdWN0IGEgeCBiID0gfGF8fGJ8c2luKM64KSBmb3IgzrguXG4gICAgYW5nbGVXaXRoU2VwOiBmdW5jdGlvbih4LCB5KSB7XG4gICAgICAgIHJldHVybiBNYXRoLmF0YW4yKFxuICAgICAgICAgICAgdGhpcy54ICogeSAtIHRoaXMueSAqIHgsXG4gICAgICAgICAgICB0aGlzLnggKiB4ICsgdGhpcy55ICogeSk7XG4gICAgfSxcblxuICAgIF9tYXRNdWx0OiBmdW5jdGlvbihtKSB7XG4gICAgICAgIHZhciB4ID0gbVswXSAqIHRoaXMueCArIG1bMV0gKiB0aGlzLnksXG4gICAgICAgICAgICB5ID0gbVsyXSAqIHRoaXMueCArIG1bM10gKiB0aGlzLnk7XG4gICAgICAgIHRoaXMueCA9IHg7XG4gICAgICAgIHRoaXMueSA9IHk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICBfYWRkOiBmdW5jdGlvbihwKSB7XG4gICAgICAgIHRoaXMueCArPSBwLng7XG4gICAgICAgIHRoaXMueSArPSBwLnk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICBfc3ViOiBmdW5jdGlvbihwKSB7XG4gICAgICAgIHRoaXMueCAtPSBwLng7XG4gICAgICAgIHRoaXMueSAtPSBwLnk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICBfbXVsdDogZnVuY3Rpb24oaykge1xuICAgICAgICB0aGlzLnggKj0gaztcbiAgICAgICAgdGhpcy55ICo9IGs7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICBfZGl2OiBmdW5jdGlvbihrKSB7XG4gICAgICAgIHRoaXMueCAvPSBrO1xuICAgICAgICB0aGlzLnkgLz0gaztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIF91bml0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5fZGl2KHRoaXMubWFnKCkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgX3BlcnA6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgeSA9IHRoaXMueTtcbiAgICAgICAgdGhpcy55ID0gdGhpcy54O1xuICAgICAgICB0aGlzLnggPSAteTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIF9yb3RhdGU6IGZ1bmN0aW9uKGFuZ2xlKSB7XG4gICAgICAgIHZhciBjb3MgPSBNYXRoLmNvcyhhbmdsZSksXG4gICAgICAgICAgICBzaW4gPSBNYXRoLnNpbihhbmdsZSksXG4gICAgICAgICAgICB4ID0gY29zICogdGhpcy54IC0gc2luICogdGhpcy55LFxuICAgICAgICAgICAgeSA9IHNpbiAqIHRoaXMueCArIGNvcyAqIHRoaXMueTtcbiAgICAgICAgdGhpcy54ID0geDtcbiAgICAgICAgdGhpcy55ID0geTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIF9yb3VuZDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMueCA9IE1hdGgucm91bmQodGhpcy54KTtcbiAgICAgICAgdGhpcy55ID0gTWF0aC5yb3VuZCh0aGlzLnkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59O1xuXG4vLyBjb25zdHJ1Y3RzIFBvaW50IGZyb20gYW4gYXJyYXkgaWYgbmVjZXNzYXJ5XG5Qb2ludC5jb252ZXJ0ID0gZnVuY3Rpb24gKGEpIHtcbiAgICBpZiAoYSBpbnN0YW5jZW9mIFBvaW50KSB7XG4gICAgICAgIHJldHVybiBhO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShhKSkge1xuICAgICAgICByZXR1cm4gbmV3IFBvaW50KGFbMF0sIGFbMV0pO1xuICAgIH1cbiAgICByZXR1cm4gYTtcbn07XG4iLCIndXNlIHN0cmljdCc7XHJcblxyXG5jb25zdCB1dGlsID0gcmVxdWlyZSgnbWFwYm94LWdsL3NyYy91dGlsL3V0aWwnKTtcclxuY29uc3QgYWpheCA9IHJlcXVpcmUoJ21hcGJveC1nbC9zcmMvdXRpbC9hamF4Jyk7XHJcbmNvbnN0IEV2ZW50ZWQgPSByZXF1aXJlKCdtYXBib3gtZ2wvc3JjL3V0aWwvZXZlbnRlZCcpO1xyXG5jb25zdCBsb2FkQXJjR0lTTWFwU2VydmVyID0gcmVxdWlyZSgnLi9sb2FkX2FyY2dpc19tYXBzZXJ2ZXInKTtcclxuY29uc3QgVGlsZUJvdW5kcyA9IHJlcXVpcmUoJ21hcGJveC1nbC9zcmMvc291cmNlL3RpbGVfYm91bmRzJyk7XHJcblxyXG4vL0Zyb20gaHR0cHM6Ly9naXRodWIuY29tL0xlYWZsZXQvTGVhZmxldC9ibG9iL21hc3Rlci9zcmMvY29yZS9VdGlsLmpzXHJcbmNvbnN0IF90ZW1wbGF0ZVJlID0gL1xceyAqKFtcXHdfXSspICpcXH0vZztcclxuY29uc3QgX3RlbXBsYXRlID0gZnVuY3Rpb24gKHN0ciwgZGF0YSkge1xyXG4gICAgcmV0dXJuIHN0ci5yZXBsYWNlKF90ZW1wbGF0ZVJlLCAoc3RyLCBrZXkpID0+IHtcclxuICAgICAgICBsZXQgdmFsdWUgPSBkYXRhW2tleV07XHJcblxyXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gdmFsdWUgcHJvdmlkZWQgZm9yIHZhcmlhYmxlICR7c3RyfWApO1xyXG5cclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICB2YWx1ZSA9IHZhbHVlKGRhdGEpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICB9KTtcclxufTtcclxuXHJcbi8vRnJvbSBodHRwczovL2dpdGh1Yi5jb20vTGVhZmxldC9MZWFmbGV0L2Jsb2IvbWFzdGVyL3NyYy9sYXllci90aWxlL1RpbGVMYXllci5qc1xyXG5jb25zdCBfZ2V0U3ViZG9tYWluID0gZnVuY3Rpb24gKHRpbGVQb2ludCwgc3ViZG9tYWlucykge1xyXG4gICAgaWYgKHN1YmRvbWFpbnMpIHtcclxuICAgICAgICBjb25zdCBpbmRleCA9IE1hdGguYWJzKHRpbGVQb2ludC54ICsgdGlsZVBvaW50LnkpICUgc3ViZG9tYWlucy5sZW5ndGg7XHJcbiAgICAgICAgcmV0dXJuIHN1YmRvbWFpbnNbaW5kZXhdO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn07XHJcblxyXG5jbGFzcyBBcmNHSVNUaWxlZE1hcFNlcnZpY2VTb3VyY2UgZXh0ZW5kcyBFdmVudGVkIHtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihpZCwgb3B0aW9ucywgZGlzcGF0Y2hlciwgZXZlbnRlZFBhcmVudCkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5pZCA9IGlkO1xyXG4gICAgICAgIHRoaXMuZGlzcGF0Y2hlciA9IGRpc3BhdGNoZXI7XHJcbiAgICAgICAgdGhpcy5zZXRFdmVudGVkUGFyZW50KGV2ZW50ZWRQYXJlbnQpO1xyXG5cclxuICAgICAgICB0aGlzLnR5cGUgPSAnYXJjZ2lzcmFzdGVyJztcclxuICAgICAgICB0aGlzLm1pbnpvb20gPSAwO1xyXG4gICAgICAgIHRoaXMubWF4em9vbSA9IDIyO1xyXG4gICAgICAgIHRoaXMucm91bmRab29tID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnRpbGVTaXplID0gNTEyO1xyXG4gICAgICAgIHRoaXMuX2xvYWRlZCA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XHJcbiAgICAgICAgdXRpbC5leHRlbmQodGhpcywgdXRpbC5waWNrKG9wdGlvbnMsIFsndXJsJywgJ3NjaGVtZScsICd0aWxlU2l6ZSddKSk7XHJcbiAgICB9XHJcblxyXG4gICAgbG9hZCgpIHtcclxuICAgICAgICB0aGlzLmZpcmUoJ2RhdGFsb2FkaW5nJywge2RhdGFUeXBlOiAnc291cmNlJ30pO1xyXG4gICAgICAgIGxvYWRBcmNHSVNNYXBTZXJ2ZXIodGhpcy5vcHRpb25zLCAoZXJyLCBtZXRhZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5maXJlKCdlcnJvcicsIGVycik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdXRpbC5leHRlbmQodGhpcywgbWV0YWRhdGEpO1xyXG4gICAgICAgICAgICB0aGlzLnNldEJvdW5kcyhtZXRhZGF0YS5ib3VuZHMpO1xyXG5cclxuICAgICAgICAgICAgLy8gYGNvbnRlbnRgIGlzIGluY2x1ZGVkIGhlcmUgdG8gcHJldmVudCBhIHJhY2UgY29uZGl0aW9uIHdoZXJlIGBTdHlsZSNfdXBkYXRlU291cmNlc2AgaXMgY2FsbGVkXHJcbiAgICAgICAgICAgIC8vIGJlZm9yZSB0aGUgVGlsZUpTT04gYXJyaXZlcy4gdGhpcyBtYWtlcyBzdXJlIHRoZSB0aWxlcyBuZWVkZWQgYXJlIGxvYWRlZCBvbmNlIFRpbGVKU09OIGFycml2ZXNcclxuICAgICAgICAgICAgLy8gcmVmOiBodHRwczovL2dpdGh1Yi5jb20vbWFwYm94L21hcGJveC1nbC1qcy9wdWxsLzQzNDcjZGlzY3Vzc2lvbl9yMTA0NDE4MDg4XHJcbiAgICAgICAgICAgIHRoaXMuZmlyZSgnZGF0YScsIHtkYXRhVHlwZTogJ3NvdXJjZScsIHNvdXJjZURhdGFUeXBlOiAnbWV0YWRhdGEnfSk7XHJcbiAgICAgICAgICAgIHRoaXMuZmlyZSgnZGF0YScsIHtkYXRhVHlwZTogJ3NvdXJjZScsIHNvdXJjZURhdGFUeXBlOiAnY29udGVudCd9KTtcclxuXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgb25BZGQobWFwKSB7XHJcbiAgICAgICAgLy8gc2V0IHRoZSB1cmxzXHJcbiAgICAgICAgY29uc3QgYmFzZVVybCA9IHRoaXMudXJsLnNwbGl0KCc/JylbMF07XHJcbiAgICAgICAgdGhpcy50aWxlVXJsID0gYCR7YmFzZVVybH0vdGlsZS97en0ve3l9L3t4fWA7XHJcblxyXG4gICAgICAgIGNvbnN0IGFyY2dpc29ubGluZSA9IG5ldyBSZWdFeHAoL3RpbGVzLmFyY2dpcyhvbmxpbmUpP1xcLmNvbS9nKTtcclxuICAgICAgICBpZiAoYXJjZ2lzb25saW5lLnRlc3QodGhpcy51cmwpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudGlsZVVybCA9IHRoaXMudGlsZVVybC5yZXBsYWNlKCc6Ly90aWxlcycsICc6Ly90aWxlc3tzfScpO1xyXG4gICAgICAgICAgICB0aGlzLnN1YmRvbWFpbnMgPSBbJzEnLCAnMicsICczJywgJzQnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnRva2VuKSB7XHJcbiAgICAgICAgICAgIHRoaXMudGlsZVVybCArPSAoYD90b2tlbj0ke3RoaXMudG9rZW59YCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMubG9hZCgpO1xyXG4gICAgICAgIHRoaXMubWFwID0gbWFwO1xyXG4gICAgfVxyXG5cclxuICAgIHNldEJvdW5kcyhib3VuZHMpIHtcclxuICAgICAgICB0aGlzLmJvdW5kcyA9IGJvdW5kcztcclxuICAgICAgICBpZiAoYm91bmRzKSB7XHJcbiAgICAgICAgICAgIHRoaXMudGlsZUJvdW5kcyA9IG5ldyBUaWxlQm91bmRzKGJvdW5kcywgdGhpcy5taW56b29tLCB0aGlzLm1heHpvb20pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzZXJpYWxpemUoKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgdHlwZTogJ2FyY2dpc3Jhc3RlcicsXHJcbiAgICAgICAgICAgIHVybDogdGhpcy51cmwsXHJcbiAgICAgICAgICAgIHRpbGVTaXplOiB0aGlzLnRpbGVTaXplLFxyXG4gICAgICAgICAgICB0aWxlczogdGhpcy50aWxlcyxcclxuICAgICAgICAgICAgYm91bmRzOiB0aGlzLmJvdW5kcyxcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGhhc1RpbGUoY29vcmQpIHtcclxuICAgICAgICByZXR1cm4gIXRoaXMudGlsZUJvdW5kcyB8fCB0aGlzLnRpbGVCb3VuZHMuY29udGFpbnMoY29vcmQsIHRoaXMubWF4em9vbSk7XHJcbiAgICB9XHJcblxyXG4gICAgbG9hZFRpbGUodGlsZSwgY2FsbGJhY2spIHtcclxuICAgICAgICAvL2NvbnZlcnQgdG8gYWdzIGNvb3Jkc1xyXG4gICAgICAgIGNvbnN0IHRpbGVQb2ludCA9IHRpbGUuY29vcmQ7XHJcbiAgICAgICAgY29uc3QgdXJsID0gIF90ZW1wbGF0ZSh0aGlzLnRpbGVVcmwsIHV0aWwuZXh0ZW5kKHtcclxuICAgICAgICAgICAgczogX2dldFN1YmRvbWFpbih0aWxlUG9pbnQsIHRoaXMuc3ViZG9tYWlucyksXHJcbiAgICAgICAgICAgIHo6ICh0aGlzLl9sb2RNYXAgJiYgdGhpcy5fbG9kTWFwW3RpbGVQb2ludC56XSkgPyB0aGlzLl9sb2RNYXBbdGlsZVBvaW50LnpdIDogdGlsZVBvaW50LnosIC8vIHRyeSBsb2QgbWFwIGZpcnN0LCB0aGVuIGp1c3QgZGVmdWFsdCB0byB6b29tIGxldmVsXHJcbiAgICAgICAgICAgIHg6IHRpbGVQb2ludC54LFxyXG4gICAgICAgICAgICB5OiB0aWxlUG9pbnQueVxyXG4gICAgICAgIH0sIHRoaXMub3B0aW9ucykpO1xyXG4gICAgICAgIHRpbGUucmVxdWVzdCA9IGFqYXguZ2V0SW1hZ2UodXJsLCBkb25lLmJpbmQodGhpcykpO1xyXG5cclxuICAgICAgICBmdW5jdGlvbiBkb25lKGVyciwgaW1nKSB7XHJcbiAgICAgICAgICAgIGRlbGV0ZSB0aWxlLnJlcXVlc3Q7XHJcblxyXG4gICAgICAgICAgICBpZiAodGlsZS5hYm9ydGVkKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gJ3VubG9hZGVkJztcclxuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhudWxsKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKGVycikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9ICdlcnJvcmVkJztcclxuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5tYXAuX3JlZnJlc2hFeHBpcmVkVGlsZXMpIHRpbGUuc2V0RXhwaXJ5RGF0YShpbWcpO1xyXG4gICAgICAgICAgICBkZWxldGUgaW1nLmNhY2hlQ29udHJvbDtcclxuICAgICAgICAgICAgZGVsZXRlIGltZy5leHBpcmVzO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZ2wgPSB0aGlzLm1hcC5wYWludGVyLmdsO1xyXG4gICAgICAgICAgICB0aWxlLnRleHR1cmUgPSB0aGlzLm1hcC5wYWludGVyLmdldFRpbGVUZXh0dXJlKGltZy53aWR0aCk7XHJcbiAgICAgICAgICAgIGlmICh0aWxlLnRleHR1cmUpIHtcclxuICAgICAgICAgICAgICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHRpbGUudGV4dHVyZSk7XHJcbiAgICAgICAgICAgICAgICBnbC50ZXhTdWJJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIDAsIDAsIDAsIGdsLlJHQkEsIGdsLlVOU0lHTkVEX0JZVEUsIGltZyk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aWxlLnRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKCk7XHJcbiAgICAgICAgICAgICAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCB0aWxlLnRleHR1cmUpO1xyXG4gICAgICAgICAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLkxJTkVBUl9NSVBNQVBfTkVBUkVTVCk7XHJcbiAgICAgICAgICAgICAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfTUFHX0ZJTFRFUiwgZ2wuTElORUFSKTtcclxuICAgICAgICAgICAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9XUkFQX1MsIGdsLkNMQU1QX1RPX0VER0UpO1xyXG4gICAgICAgICAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfVCwgZ2wuQ0xBTVBfVE9fRURHRSk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMubWFwLnBhaW50ZXIuZXh0VGV4dHVyZUZpbHRlckFuaXNvdHJvcGljKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZ2wudGV4UGFyYW1ldGVyZihnbC5URVhUVVJFXzJELCB0aGlzLm1hcC5wYWludGVyLmV4dFRleHR1cmVGaWx0ZXJBbmlzb3Ryb3BpYy5URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgdGhpcy5tYXAucGFpbnRlci5leHRUZXh0dXJlRmlsdGVyQW5pc290cm9waWNNYXgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGdsLnRleEltYWdlMkQoZ2wuVEVYVFVSRV8yRCwgMCwgZ2wuUkdCQSwgZ2wuUkdCQSwgZ2wuVU5TSUdORURfQllURSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRpbGUudGV4dHVyZS5zaXplID0gaW1nLndpZHRoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGdsLmdlbmVyYXRlTWlwbWFwKGdsLlRFWFRVUkVfMkQpO1xyXG5cclxuICAgICAgICAgICAgdGlsZS5zdGF0ZSA9ICdsb2FkZWQnO1xyXG5cclxuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGFib3J0VGlsZSh0aWxlKSB7XHJcbiAgICAgICAgaWYgKHRpbGUucmVxdWVzdCkge1xyXG4gICAgICAgICAgICB0aWxlLnJlcXVlc3QuYWJvcnQoKTtcclxuICAgICAgICAgICAgZGVsZXRlIHRpbGUucmVxdWVzdDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdW5sb2FkVGlsZSh0aWxlKSB7XHJcbiAgICAgICAgaWYgKHRpbGUudGV4dHVyZSkgdGhpcy5tYXAucGFpbnRlci5zYXZlVGlsZVRleHR1cmUodGlsZS50ZXh0dXJlKTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBcmNHSVNUaWxlZE1hcFNlcnZpY2VTb3VyY2U7XHJcbiIsImNvbnN0IEFyY0dJU1RpbGVkTWFwU2VydmljZVNvdXJjZSA9IHJlcXVpcmUoJy4vYXJjZ2lzX3RpbGVkX21hcF9zZXJ2aWNlX3NvdXJjZScpO1xyXG5tb2R1bGUuZXhwb3J0cyA9IEFyY0dJU1RpbGVkTWFwU2VydmljZVNvdXJjZTsiLCIndXNlIHN0cmljdCc7XHJcbmNvbnN0IHV0aWwgPSByZXF1aXJlKCdtYXBib3gtZ2wvc3JjL3V0aWwvdXRpbCcpO1xyXG5jb25zdCBhamF4ID0gcmVxdWlyZSgnbWFwYm94LWdsL3NyYy91dGlsL2FqYXgnKTtcclxuY29uc3QgYnJvd3NlciA9IHJlcXVpcmUoJ21hcGJveC1nbC9zcmMvdXRpbC9icm93c2VyJyk7XHJcbmNvbnN0IFNwaGVyaWNhbE1lcmNhdG9yID0gcmVxdWlyZSgnQG1hcGJveC9zcGhlcmljYWxtZXJjYXRvcicpO1xyXG5cclxuLy9Db250YWlucyBjb2RlIGZyb20gZXNyaS1sZWFmbGV0IGh0dHBzOi8vZ2l0aHViLmNvbS9Fc3JpL2VzcmktbGVhZmxldFxyXG5jb25zdCBNZXJjYXRvclpvb21MZXZlbHMgPSB7XHJcbiAgICAnMCc6IDE1NjU0My4wMzM5Mjc5OTk5OSxcclxuICAgICcxJzogNzgyNzEuNTE2OTYzOTk5ODkzLFxyXG4gICAgJzInOiAzOTEzNS43NTg0ODIwMDAwOTksXHJcbiAgICAnMyc6IDE5NTY3Ljg3OTI0MDk5OTkwMSxcclxuICAgICc0JzogOTc4My45Mzk2MjA0OTk5NTkzLFxyXG4gICAgJzUnOiA0ODkxLjk2OTgxMDI0OTk3OTcsXHJcbiAgICAnNic6IDI0NDUuOTg0OTA1MTI0OTg5OCxcclxuICAgICc3JzogMTIyMi45OTI0NTI1NjI0ODk5LFxyXG4gICAgJzgnOiA2MTEuNDk2MjI2MjgxMzgwMDIsXHJcbiAgICAnOSc6IDMwNS43NDgxMTMxNDA1NTgwMixcclxuICAgICcxMCc6IDE1Mi44NzQwNTY1NzA0MTEsXHJcbiAgICAnMTEnOiA3Ni40MzcwMjgyODUwNzMxOTcsXHJcbiAgICAnMTInOiAzOC4yMTg1MTQxNDI1MzY1OTgsXHJcbiAgICAnMTMnOiAxOS4xMDkyNTcwNzEyNjgyOTksXHJcbiAgICAnMTQnOiA5LjU1NDYyODUzNTYzNDE0OTYsXHJcbiAgICAnMTUnOiA0Ljc3NzMxNDI2Nzk0OTM2OTksXHJcbiAgICAnMTYnOiAyLjM4ODY1NzEzMzk3NDY4LFxyXG4gICAgJzE3JzogMS4xOTQzMjg1NjY4NTUwNTAxLFxyXG4gICAgJzE4JzogMC41OTcxNjQyODM1NTk4MTY5OSxcclxuICAgICcxOSc6IDAuMjk4NTgyMTQxNjQ3NjE2OTgsXHJcbiAgICAnMjAnOiAwLjE0OTI5MTA3MDgyMzgxLFxyXG4gICAgJzIxJzogMC4wNzQ2NDU1MzU0MTE5MSxcclxuICAgICcyMic6IDAuMDM3MzIyNzY3NzA1OTUyNSxcclxuICAgICcyMyc6IDAuMDE4NjYxMzgzODUyOTc2M1xyXG59O1xyXG5cclxuY29uc3QgX3dpdGhpblBlcmNlbnRhZ2UgPSBmdW5jdGlvbiAoYSwgYiwgcGVyY2VudGFnZSkge1xyXG4gICAgY29uc3QgZGlmZiA9IE1hdGguYWJzKChhIC8gYikgLSAxKTtcclxuICAgIHJldHVybiBkaWZmIDwgcGVyY2VudGFnZTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucywgY2FsbGJhY2spIHtcclxuICAgIGNvbnN0IGxvYWRlZCA9IGZ1bmN0aW9uKGVyciwgbWV0YWRhdGEpIHtcclxuICAgICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdXRpbC5waWNrKG1ldGFkYXRhLFxyXG4gICAgICAgICAgICBbJ3RpbGVJbmZvJywgJ2luaXRpYWxFeHRlbnQnLCAnZnVsbEV4dGVudCcsICdzcGF0aWFsUmVmZXJlbmNlJywgJ3RpbGVTZXJ2ZXJzJywgJ2RvY3VtZW50SW5mbyddKTtcclxuXHJcbiAgICAgICAgcmVzdWx0Ll9sb2RNYXAgPSB7fTtcclxuICAgICAgICBjb25zdCB6b29tT2Zmc2V0QWxsb3dhbmNlID0gMC4xO1xyXG4gICAgICAgIGNvbnN0IHNyID0gbWV0YWRhdGEuc3BhdGlhbFJlZmVyZW5jZS5sYXRlc3RXa2lkIHx8IG1ldGFkYXRhLnNwYXRpYWxSZWZlcmVuY2Uud2tpZDtcclxuICAgICAgICBpZiAoc3IgPT09IDEwMjEwMCB8fCBzciA9PT0gMzg1Nykge1xyXG5cclxuICAgICAgICAgICAgLypcclxuICAgICAgICAgICAgRXhhbXBsZSBleHRlbnQgZnJvbSBBcmNHSVMgUkVTVCBBUElcclxuICAgICAgICAgICAgZnVsbEV4dGVudDoge1xyXG4gICAgICAgICAgICB4bWluOiAtOTE0NDc5MS42NzkyMjYxMjcsXHJcbiAgICAgICAgICAgIHltaW46IC0yMTk1MTkwLjk2MTQzNzcyNixcclxuICAgICAgICAgICAgeG1heDogLTQ2NTA5ODcuMDcyMDE5OTgzLFxyXG4gICAgICAgICAgICB5bWF4OiAxMTE4MTEzLjExMDE1NTc2NixcclxuICAgICAgICAgICAgc3BhdGlhbFJlZmVyZW5jZToge1xyXG4gICAgICAgICAgICB3a2lkOiAxMDIxMDAsXHJcbiAgICAgICAgICAgIHdrdDogbnVsbFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgIC8vY29udmVydCBBcmNHSVMgZXh0ZW50IHRvIGJvdW5kc1xyXG4gICAgICAgICAgICBjb25zdCBleHRlbnQgPSBtZXRhZGF0YS5mdWxsRXh0ZW50O1xyXG4gICAgICAgICAgICBpZiAoZXh0ZW50ICYmIGV4dGVudC5zcGF0aWFsUmVmZXJlbmNlICYmIGV4dGVudC5zcGF0aWFsUmVmZXJlbmNlLndraWQgPT09ICAxMDIxMDApIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJvdW5kc1dlYk1lcmNhdG9yID0gW2V4dGVudC54bWluLCBleHRlbnQueW1pbiwgZXh0ZW50LnhtYXgsIGV4dGVudC55bWF4XTtcclxuICAgICAgICAgICAgICAgIHZhciBtZXJjID0gbmV3IFNwaGVyaWNhbE1lcmNhdG9yKHtcclxuICAgICAgICAgICAgICAgICAgICBzaXplOiAyNTZcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYm91bmRzV0dTODQgPSBtZXJjLmNvbnZlcnQoYm91bmRzV2ViTWVyY2F0b3IpO1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0LmJvdW5kcyA9IGJvdW5kc1dHUzg0O1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBjcmVhdGUgdGhlIHpvb20gbGV2ZWwgZGF0YVxyXG4gICAgICAgICAgICBjb25zdCBhcmNnaXNMT0RzID0gbWV0YWRhdGEudGlsZUluZm8ubG9kcztcclxuICAgICAgICAgICAgY29uc3QgY29ycmVjdFJlc29sdXRpb25zID0gTWVyY2F0b3Jab29tTGV2ZWxzO1xyXG4gICAgICAgICAgICByZXN1bHQubWluem9vbSA9IGFyY2dpc0xPRHNbMF0ubGV2ZWw7XHJcbiAgICAgICAgICAgIC8vY2hhbmdlXHJcbiAgICAgICAgICAgIHJlc3VsdC5tYXh6b29tID0gMjI7XHJcbiAgICAgICAgICAgIC8vIHJlc3VsdC5tYXh6b29tID0gYXJjZ2lzTE9Ec1thcmNnaXNMT0RzLmxlbmd0aCAtIDFdLmxldmVsO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyY2dpc0xPRHMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGFyY2dpc0xPRCA9IGFyY2dpc0xPRHNbaV07XHJcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNpIGluIGNvcnJlY3RSZXNvbHV0aW9ucykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvcnJlY3RSZXMgPSBjb3JyZWN0UmVzb2x1dGlvbnNbY2ldO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoX3dpdGhpblBlcmNlbnRhZ2UoYXJjZ2lzTE9ELnJlc29sdXRpb24sIGNvcnJlY3RSZXMsIHpvb21PZmZzZXRBbGxvd2FuY2UpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5fbG9kTWFwW2NpXSA9IGFyY2dpc0xPRC5sZXZlbDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vY2hhbmdlXHJcbiAgICAgICAgLy8gIGVsc2Uge1xyXG4gICAgICAgIC8vICAgICBjYWxsYmFjayhuZXcgRXJyb3IoJ25vbi1tZXJjYXRvciBzcGF0aWFsIHJlZmVyZW5jZScpKTtcclxuICAgICAgICAvLyB9XHJcblxyXG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdCk7XHJcbiAgICB9O1xyXG5cclxuICAgIGlmIChvcHRpb25zLnVybCkge1xyXG4gICAgICAgIGFqYXguZ2V0SlNPTihvcHRpb25zLnVybCwgbG9hZGVkKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYnJvd3Nlci5mcmFtZShsb2FkZWQuYmluZChudWxsLCBudWxsLCBvcHRpb25zKSk7XHJcbiAgICB9XHJcbn07XHJcbiJdfQ==
