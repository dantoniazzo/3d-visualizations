export default function (domSelectors) {
    const elements = {};

    Object.entries(domSelectors).forEach(([key, selector]) => {
        elements[key] = document.querySelector(selector);
    });

    return elements;
}
