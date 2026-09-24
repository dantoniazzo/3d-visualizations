import * as THREE from "three";

/**
 * The red stand-in drawn where the cursor wants a piece that does not fit
 * there. It shares the piece's geometry, so building one costs no more
 * than a handful of mesh objects.
 */
export default class Ghost {
    constructor(scene) {
        this.scene = scene;
        this.root = null;
        this.source = null;
        this.material = new THREE.MeshBasicMaterial({
            color: 0xff3b3b,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
    }

    show(editable, pose) {
        if (!editable.object3d) return;
        if (this.source !== editable) this.build(editable);

        this.root.position.copy(pose.position);
        this.root.rotation.set(0, pose.yaw, 0);
        this.root.scale.copy(pose.scale);
        this.root.visible = true;
    }

    build(editable) {
        this.reset();
        const object = editable.object3d;
        object.updateWorldMatrix(true, true);
        const inverse = object.matrixWorld.clone().invert();

        const root = new THREE.Group();
        root.name = "ghost";
        root.userData.helper = true;
        object.traverse((child) => {
            if (!child.isMesh || !child.geometry) return;
            const mesh = new THREE.Mesh(child.geometry, this.material);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.multiplyMatrices(inverse, child.matrixWorld);
            mesh.renderOrder = 10;
            mesh.userData.helper = true;
            root.add(mesh);
        });

        this.root = root;
        this.source = editable;
        this.scene.add(root);
    }

    hide() {
        if (this.root) this.root.visible = false;
    }

    reset() {
        if (this.root) this.scene.remove(this.root);
        this.root = null;
        this.source = null;
    }

    dispose() {
        this.reset();
        this.material.dispose();
    }
}
