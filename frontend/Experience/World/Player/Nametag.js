import * as THREE from "three";

/**
 * Canvas-rendered name label that always faces the camera.
 */
export default class Nametag {
    createNametag(size = 18, baseWidth = 170, name = "Guest") {
        const borderSize = 3;
        const ctx = document.createElement("canvas").getContext("2d");
        const font = `500 ${size}px Inter, system-ui, sans-serif`;

        ctx.font = font;
        const textWidth = ctx.measureText(name).width;

        const width = baseWidth + borderSize * 2;
        const height = size + borderSize * 4;
        ctx.canvas.width = width;
        ctx.canvas.height = height;

        // Canvas state resets when the backing store is resized.
        ctx.font = font;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";

        ctx.fillStyle = "rgba(12, 14, 18, 0.62)";
        roundedRect(ctx, 0, 0, width, height, height / 2);
        ctx.fill();

        const scaleFactor = Math.min(1, (baseWidth - 16) / textWidth);
        ctx.translate(width / 2, height / 2);
        ctx.scale(scaleFactor, 1);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(name, 0, 1);

        const texture = new THREE.CanvasTexture(ctx.canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
        });

        const label = new THREE.Sprite(material);
        const scale = 0.006;
        label.scale.set(ctx.canvas.width * scale, ctx.canvas.height * scale, 1);
        label.renderOrder = 10;

        return label;
    }
}

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}
