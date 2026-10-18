// pick.js: which avatar the visitor gets, chosen before the preloader's avatar list is clicked — for when the name
// prompt is passed some other way than boot.js (boot.js itself clicks `.avatar-option[data-avatar=<window.__pickSkin>]`).
// Before the prompt, right after a navigation:
//   window.__pickSkin = "female"; await eval(await (await fetch("http://127.0.0.1:3199/pick.js")).text())   → "picking female"
// It moves that `.avatar-option` (Preloader.js: data-avatar = the avatar's id, "male" | "female") first among its
// siblings, now and whenever the preloader draws them again, so whatever clicks the first option picks it. Check after:
// world.player.player.avatarSkin.
(() => {
    window.__pickSkin ??= "female";
    const put = () => {
        const want = window.__pickSkin;
        const option = document.querySelector(`.avatar-option[data-avatar="${want}"]`);
        if (option && option.parentElement && option.parentElement.firstElementChild !== option) option.parentElement.prepend(option);
    };
    put();
    if (!window.__pickObserver) {
        window.__pickObserver = new MutationObserver(put);
        window.__pickObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    return `picking ${window.__pickSkin}`;
})();
