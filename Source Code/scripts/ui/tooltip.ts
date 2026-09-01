/**
 * File: scripts/ui/tooltip.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), DOM
 *
 * Description:
 * Attaches tooltips to any element carrying a `data-tooltip` attribute.
 *
 * One shared element is positioned in script rather than a pseudo-element per
 * control, for two reasons. A control inside the viewfinder would clip its own
 * pseudo-element against that container's overflow boundary. And a single
 * element can be kept inside the viewport on a narrow screen, which a
 * pseudo-element anchored to its parent cannot.
 *
 * Tooltips are suppressed on touch input. There is no hover state on a touch
 * screen, so a tooltip there either never appears or appears on the tap that
 * already activated the control, and neither is useful. Touch users are served
 * by the accessible names on the controls and by the intro guide.
 */

/** Distance between the control and its tooltip, in pixels. */
const OFFSET = 10;

/** Margin kept between the tooltip and the edge of the viewport. */
const EDGE_MARGIN = 8;

export class TooltipController {
    private current: HTMLElement | null = null;
    private usingTouch = false;

    constructor(private readonly tooltip: HTMLElement) {}

    /** Binds the document-level listeners. Called once at start-up. */
    attach(): void {
        // A touch anywhere marks the session as touch driven. Pointer events
        // report their own type, which is more reliable than a media query for
        // a device that has both a trackpad and a touch screen.
        document.addEventListener(
            'pointerdown',
            (event) => {
                this.usingTouch = event.pointerType === 'touch';

                if (this.usingTouch) {
                    this.hide();
                }
            },
            { capture: true },
        );

        document.addEventListener('pointerover', this.onPointerOver);
        document.addEventListener('pointerout', this.onPointerOut);

        // Keyboard users receive tooltips, since focus is an explicit intent.
        document.addEventListener('focusin', this.onFocusIn);
        document.addEventListener('focusout', () => this.hide());

        // A tooltip anchored to a control that has moved is worse than none.
        window.addEventListener('scroll', () => this.hide(), { passive: true });
        window.addEventListener('resize', () => this.hide());
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.hide();
            }
        });
    }

    private readonly onPointerOver = (event: PointerEvent): void => {
        if (this.usingTouch || event.pointerType === 'touch') {
            return;
        }

        const target = this.findAnchor(event.target);

        if (target) {
            this.show(target);
        }
    };

    private readonly onPointerOut = (event: PointerEvent): void => {
        const target = this.findAnchor(event.target);

        if (target && target === this.current) {
            this.hide();
        }
    };

    private readonly onFocusIn = (event: FocusEvent): void => {
        const target = this.findAnchor(event.target);

        if (target) {
            this.show(target);
        }
    };

    /** Walks up from the event target to the nearest element with a tooltip. */
    private findAnchor(target: EventTarget | null): HTMLElement | null {
        if (!(target instanceof Element)) {
            return null;
        }

        return target.closest<HTMLElement>('[data-tooltip]');
    }

    private show(anchor: HTMLElement): void {
        const text = anchor.dataset.tooltip;

        if (!text) {
            return;
        }

        this.current = anchor;
        this.tooltip.textContent = text;
        this.tooltip.hidden = false;

        // The element must be laid out before it can be measured, so position
        // is computed after it is made visible but before it is faded in.
        this.position(anchor);
        this.tooltip.dataset.visible = 'true';
    }

    /**
     * Places the tooltip above the control, or below it when there is no room
     * above, and clamps it horizontally so it never leaves the viewport.
     */
    private position(anchor: HTMLElement): void {
        const anchorBox = anchor.getBoundingClientRect();
        const tooltipBox = this.tooltip.getBoundingClientRect();

        const preferredTop = anchorBox.top - tooltipBox.height - OFFSET;
        const fitsAbove = preferredTop >= EDGE_MARGIN;

        const top = fitsAbove ? preferredTop : anchorBox.bottom + OFFSET;

        const centred = anchorBox.left + anchorBox.width / 2 - tooltipBox.width / 2;
        const maximumLeft = window.innerWidth - tooltipBox.width - EDGE_MARGIN;
        const left = Math.max(EDGE_MARGIN, Math.min(centred, maximumLeft));

        this.tooltip.style.top = `${Math.round(top)}px`;
        this.tooltip.style.left = `${Math.round(left)}px`;
    }

    private hide(): void {
        this.current = null;
        this.tooltip.dataset.visible = 'false';

        // Kept in the layout until the fade completes, then removed so it
        // cannot be reached by a screen reader or the caret browser.
        window.setTimeout(() => {
            if (this.tooltip.dataset.visible === 'false') {
                this.tooltip.hidden = true;
            }
        }, 160);
    }
}
