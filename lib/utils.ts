export function highlightElement(id: string) {
    const el = document.getElementById(id);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.classList.add("ring-2", "ring-yellow-400")
    setTimeout(() => {
        el.classList.remove("ring-2", "ring-yellow-400")
    }, 1500)
}