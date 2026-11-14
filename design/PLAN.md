# Washington transit: design plan

The transit map is a standalone lab on kylepace.dev (kp-design's `LabLayout`). This is
its own look, written down so later changes stay in it. Tokens live in
`src/styles/theme.css`.

## Concept: a station wall map

Every station in Puget Sound has the same object on its wall: a big system map with a
green sign mounted on it that says where you are. That's the page. The map fills the
screen, and one sign plate sits on it holding the name, the live readout and the
controls. Below the map, a timetable lists who's on it. The agencies page is the
system directory you'd find next to that wall map.

Audience: anyone curious where the buses, trains and ferries are right now, on a phone
as often as a laptop. Primary job: show the vehicles, then let people find a route.

## Color

Named after the things they come from. The map's own water and land are retinted to
match, so the page and the map read as one surface.

| Name | Light | Dark | Use |
|---|---|---|---|
| Shore | `#eceee8` | `#121719` | Page background and the map's land |
| Sound | `#b3cad2` | `#1a3440` | The map's water (Puget Sound, lakes, rivers) |
| Guide green | `#0b5a47` | `#0e6651` | The sign plate, with white text (the green of Washington's guide and ferry signs) |
| Ink | `#0f1a1d` | `#e4ebed` | Text |
| Weathered ink | `#46545a` | `#9badb3` | Secondary text |
| Panel | `#f9faf7` | `#1b2225` | The body of the sign, menus, popups |

Links and focus rings use Guide green as text (`#0b5a47` light, `#6fd0ad` dark).
Agency and route colors stay as they are: they carry information.

Every text pair meets 4.5:1; control borders meet 3:1.

## Type

Atkinson Hyperlegible Next only (it was drawn for legibility, which is what transit
signage is for). Personality comes from how it's set:

- **Sign title:** 700, tight leading (1.05), slightly negative tracking, white on
  Guide green. Sentence case, like modern wayfinding.
- **Readout:** 600, tabular figures, on the plate under the title.
- **Legend and controls:** 600 at step -1, the size of map legend text.
- **Timetable figures:** 700, tabular, right-aligned in their column.
- **Body:** 400 at step 0, line length under 70 characters.

No all-caps labels, no monospace labels, no eyebrows.

## Layout

Desktop: the map fills the window under the back bar; the sign is mounted top-left.
A strip of the timetable shows at the bottom so it's clear there's more below.

```
+--------------------------------------------------------------+
| < kylepace.dev                           Live map  Agencies  |
+--------------------------------------------------------------+
| +----------------------+                               [+]   |
| | Washington transit   |  <- Guide green plate         [-]   |
| | 532 vehicles moving  |                               [o]   |
| +----------------------+                               [ ]   |
| | [Find a route......] |                                     |
| | Show                 |           the map                   |
| |  --- Buses       [x] |  <- legend: line weight as drawn    |
| |  === Light rail  [x] |                                     |
| |  === Trains      [x] |                                     |
| |  === Ferries     [x] |                                     |
| | Routes Stops Colors  |                                     |
| | Jump to [Puget v]    |                                     |
| +----------------------+                                     |
| (c) OSM                                                (Aa)  |
+--------------------------------------------------------------+
| Who's on the map                                              |
| Live positions                    Routes and stops only      |
| King County Metro ......... 412   Clallam Transit            |
| Sound Transit .............. 61   ...                        |
```

Phone: the sign sits above the map instead of on it, with the legend folded into a
"Layers" disclosure, so the map keeps most of the screen. Map attribution moves to
the bottom-left so the display settings button keeps the bottom-right.

```
+----------------------------+
| < kylepace.dev  Map Agencies|
+----------------------------+
| Washington transit         |
| 532 vehicles moving        |
| [Find a route..........]   |
| > Layers and places        |
+----------------------------+
|                       [+]  |
|          the map      [-]  |
|                            |
| (c)                  (Aa)  |
+----------------------------+
```

Agencies page: a directory, not a grid of cards. One row per agency: its network
drawing on the left, its name on a plate in the agency's own color (like a route
sign), then the facts as a sentence. Two columns of rows on wide screens, one on
phones. Region filters are text tabs with an underline for the selected one.

Everything is left-aligned, the way signs and timetables are.

## Principles

1. **The map is the product.** It gets the whole screen and the only strong color
   besides the agencies' own. Everything else is quiet.
2. **Every mark means something.** The legend shows line weights as the map draws
   them; plates carry names; rules separate rows of a timetable. No decorative dots,
   chips or badges.
3. **Say it like a sign.** Short, plain, sentence case. "532 vehicles moving",
   not a paragraph about what the page does.
4. **Corners like hardware.** Small radii (4px plates, 6px panel), no soft shadows
   except one under the floating sign, where something really sits on top of the map.

## Review against generic defaults

First draft, and what changed:

- *Departure-board look: amber numbers on a near-black page.* That's the
  near-black-plus-one-bright-accent default, and it pulls attention from the map.
  Replaced with Shore and Sound, taken from the map itself, and one signage green.
- *A big live vehicle count with a small label as the hero.* The stat-hero default.
  The count now reads as a sentence on the sign ("532 vehicles moving now").
- *Pill toggles with colored mode discs* (the old page). Replaced with a map legend:
  the mode's line weight as drawn, its name and a real checkbox.
- *Agencies as a grid of identical rounded cards with a big totals row.* Replaced
  with the directory rows and one summary sentence.
- *Middle dots in meta lines* (popups, status). Now commas and plain sentences.

## The about page

`/transit/about/` uses the standard About page title, headings and step format (the
`about-page` skill): the words are the same as every other project's, and the look is this
lab's. The title sits on the same green plate as the other pages. "How it works" is the one
drawn part: its steps run down a Guide green line with a stop for each, terminals filled at
both ends, like the line diagram above the doors of a train car. Everything else is ruled
headings and body text, under 70 characters a line. Counts and dates are read from the
data files at build time, never typed in.
