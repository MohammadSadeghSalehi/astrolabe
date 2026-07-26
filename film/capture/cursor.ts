import type { Locator, Page } from "playwright";

type Point = { x: number; y: number };

export async function installCursor(page: Page) {
  await page.addStyleTag({
    content: `
      #astro-cursor {
        position: fixed; left: 0; top: 0; z-index: 2147483647;
        width: 22px; height: 22px; margin: -11px 0 0 -11px;
        pointer-events: none; will-change: transform;
        border-radius: 50%; border: 2px solid #ECE7DB;
        background: rgba(236,231,219,.14);
        box-shadow: 0 0 0 1px rgba(8,11,17,.55), 0 2px 10px rgba(0,0,0,.5);
        transition: width .12s, height .12s, margin .12s, background .12s;
      }
      #astro-cursor.is-down {
        width: 15px; height: 15px; margin: -7.5px 0 0 -7.5px;
        background: rgba(200,150,62,.85); border-color: #EFD39B;
      }
      .astro-ripple {
        position: fixed; z-index: 2147483646; pointer-events: none;
        width: 12px; height: 12px; margin: -6px 0 0 -6px;
        border-radius: 50%; border: 2px solid #C8963E;
        animation: astro-ripple 520ms cubic-bezier(.22,1,.36,1) forwards;
      }
      @keyframes astro-ripple {
        to { width: 62px; height: 62px; margin: -31px 0 0 -31px; opacity: 0; }
      }`,
  });

  await page.evaluate(() => {
    document.querySelector("#astro-cursor")?.remove();
    const cursor = document.createElement("div");
    cursor.id = "astro-cursor";
    document.body.appendChild(cursor);
    window.__astroCursor = (x: number, y: number) => {
      cursor.style.transform = `translate(${x}px, ${y}px)`;
    };
    window.__astroCursorDown = (down: boolean) => {
      cursor.classList.toggle("is-down", down);
    };
    window.__astroRipple = (x: number, y: number) => {
      const ripple = document.createElement("div");
      ripple.className = "astro-ripple";
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    };
  });
}

export async function glide(page: Page, to: Point, ms = 700) {
  const steps = Math.max(2, Math.round((ms / 1000) * 60));
  const from = ((page as Page & { __astroPos?: Point }).__astroPos ?? to);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    const x = from.x + (to.x - from.x) * eased;
    const y = from.y + (to.y - from.y) * eased;
    await page.mouse.move(x, y);
    await page.evaluate(([px, py]) => window.__astroCursor?.(px, py), [x, y]);
    await page.waitForTimeout(1000 / 60);
  }
  (page as Page & { __astroPos?: Point }).__astroPos = to;
}

export async function centre(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Target is not visible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function filmClick(page: Page, locator: Locator, ms = 700) {
  const point = await centre(locator);
  await glide(page, point, ms);
  await page.evaluate(([x, y]) => {
    window.__astroCursorDown?.(true);
    window.__astroRipple?.(x, y);
  }, [point.x, point.y]);
  await page.mouse.down();
  await page.waitForTimeout(140);
  await page.mouse.up();
  await page.evaluate(() => window.__astroCursorDown?.(false));
}

export async function filmDrag(
  page: Page,
  from: Point,
  to: Point,
  ms = 3500,
) {
  await glide(page, from, 700);
  await page.evaluate(([x, y]) => {
    window.__astroCursorDown?.(true);
    window.__astroRipple?.(x, y);
  }, [from.x, from.y]);
  await page.mouse.down();
  await glide(page, to, ms);
  await page.mouse.up();
  await page.evaluate(() => window.__astroCursorDown?.(false));
}

declare global {
  interface Window {
    __astroCursor?: (x: number, y: number) => void;
    __astroCursorDown?: (down: boolean) => void;
    __astroRipple?: (x: number, y: number) => void;
  }
}
