/**
 * File: scripts/ui/frame-guide.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), SVG
 *
 * Description:
 * Draws the window outline over the viewfinder without putting it in the
 * recording.
 *
 * Why this exists at all
 * ----------------------
 * The shader draws the window, and everything the shader draws is recorded,
 * because the canvas it draws on is the canvas the recorder captures. That is
 * the property the whole project rests on, and for a normal take it is exactly
 * what is wanted.
 *
 * The restyle path wants the opposite. The take it records has to be the clean
 * camera image, with no window and no marching ants, because a video model is
 * going to redraw it and the outline would be redrawn with it. But the person
 * holding the pose still has to see where the window is, or they cannot frame
 * anything.
 *
 * So the outline moves out of the canvas and into the document. An SVG over the
 * viewfinder is not part of the captured surface, so it is visible to the user
 * and absent from the file. The corners come from the renderer's own
 * projection, so the guide and the shader cannot disagree about where the
 * window is.
 *
 * The element is created once and only its geometry is written per frame.
 * Rebuilding it would allocate on every animation frame for no benefit.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export class FrameGuide {
    private readonly outline: SVGPolygonElement;
    private readonly corners: SVGCircleElement[] = [];

    constructor(private readonly root: SVGSVGElement) {
        this.outline = root.querySelector<SVGPolygonElement>('[data-role="guide-outline"]')!;

        for (const circle of root.querySelectorAll<SVGCircleElement>('[data-role="guide-corner"]')) {
            this.corners.push(circle);
        }
    }

    /**
     * Matches the drawing surface, so a corner in canvas pixels lands on the
     * pixel the shader would have drawn it on.
     */
    setOutputSize(width: number, height: number): void {
        this.root.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    /** Draws the window, or hides the guide when there is none. */
    update(points: Array<{ x: number; y: number }> | null, presence: number): void {
        if (!points || points.length !== 4 || presence <= 0.01) {
            this.hide();
            return;
        }

        // An attribute rather than the `hidden` property: that property is
        // declared on HTML elements, and this is an SVG one.
        this.root.dataset.visible = 'true';
        this.root.style.opacity = String(presence);

        this.outline.setAttribute(
            'points',
            points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),
        );

        points.forEach((point, index) => {
            const corner = this.corners[index];

            if (!corner) {
                return;
            }

            corner.setAttribute('cx', point.x.toFixed(1));
            corner.setAttribute('cy', point.y.toFixed(1));
        });
    }

    /** Removes the guide, used when the mode is switched off. */
    hide(): void {
        this.root.dataset.visible = 'false';
    }
}

/**
 * Builds the guide's markup.
 *
 * Written here rather than in the document because it is the only generated
 * markup in the project, and it is generated for a reason: the element belongs
 * to a mode most sessions never enter, and the corner count is the quad's, not
 * a number to keep in step by hand in two files.
 */
export function createFrameGuide(host: HTMLElement): FrameGuide {
    const svg = document.createElementNS(SVG_NS, 'svg');

    svg.setAttribute('class', 'guide');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.dataset.visible = 'false';

    const outline = document.createElementNS(SVG_NS, 'polygon');
    outline.setAttribute('class', 'guide__outline');
    outline.dataset.role = 'guide-outline';
    svg.append(outline);

    for (let i = 0; i < 4; i += 1) {
        const corner = document.createElementNS(SVG_NS, 'circle');
        corner.setAttribute('class', 'guide__corner');
        corner.setAttribute('r', '9');
        corner.dataset.role = 'guide-corner';
        svg.append(corner);
    }

    host.append(svg);

    return new FrameGuide(svg);
}
