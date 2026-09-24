// Inert stand-in for the native `canvas` module in tests (see stubMissingCanvas.js).
const unavailable = () => {
    throw new Error('canvas is not available in this test environment');
};

module.exports = {
    createCanvas: unavailable,
    loadImage: unavailable,
    Image: function Image() {},
    DOMMatrix: function DOMMatrix() {},
    Path2D: function Path2D() {},
    ImageData: function ImageData() {}
};
