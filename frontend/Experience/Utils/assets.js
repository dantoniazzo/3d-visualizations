/**
 * Everything loaded up front, regardless of which scene is opened.
 *
 * Scene geometry is built procedurally from the scene spec, so the only
 * binary assets are the avatars. Adding an avatar here plus an entry in
 * AVATARS below is all it takes to offer another character.
 */
export default [
    {
        name: "male",
        type: "glbModel",
        path: "/models/avatar_male.glb",
    },
    {
        name: "female",
        type: "glbModel",
        path: "/models/avatar_female.glb",
    },
];

/** Character picker options — `id` must match a resource name above. */
export const AVATARS = [
    { id: "male", label: "Alex", image: "/images/avatar_male_head.webp" },
    { id: "female", label: "Sam", image: "/images/avatar_female_head.webp" },
];
