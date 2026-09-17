class_name CardPrintSpec
extends RefCounted

## Physical manufacturing reference — metal / acrylic engraved cards.
## Digital catalog pixels are preview; print masters use PRINT_PX at 300 DPI.

const TRIM_MM := Vector2(63.5, 88.9)
const BLEED_MM := 3.0
const SAFE_MM := 3.0
const TYPICAL_THICKNESS_MM := 0.8

const CATALOG_PX := Vector2(180, 252)
const PRINT_PX := Vector2(750, 1050)
const PRINT_DPI := 300

const FRAME_TEXTURE := "res://game_assets/ui/card_frame.png"
const FOIL_MASK_TEXTURE := "res://game_assets/ui/card_frame_foil.png"

## Normalized layout (0–1) aligned with 750×1050 print masters — scales to every display mode.
const LAYOUT := {
	"strip_width": 14.0 / 750.0,
	"inset_x": 24.0 / 750.0,
	"title_bottom": 121.0 / 1050.0,
	"art_top": 125.0 / 1050.0,
	"art_bottom": 533.0 / 1050.0,
	"text_top": 548.0 / 1050.0,
	"text_bottom": 917.0 / 1050.0,
	"stats_top": 927.0 / 1050.0,
	"rarity_top": 3.0 / 1050.0,
	"rarity_bottom": 11.0 / 1050.0,
	"rarity_right_inset": 12.0 / 750.0,
	"stat_row_height": 24.0 / 1050.0,
	"frame_inset": 4.0 / 180.0,
}


static func card_region(card_size: Vector2, left: float, top: float, right: float, bottom: float) -> Rect2:
	return Rect2(
		left * card_size.x,
		top * card_size.y,
		(right - left) * card_size.x,
		(bottom - top) * card_size.y,
	)

enum PhysicalMaterial { ANODIZED_ALUMINUM, ACRYLIC, STAINLESS }

## Laser/CNC groove depths for quoting with fabricators (mm).
const ENGRAVE_HAIRLINE_MM := 0.08
const ENGRAVE_TEXT_MM := 0.12
const ENGRAVE_ART_CHANNEL_MM := 0.25
const ENGRAVE_STAT_WELL_MM := 0.30

## card_frame_foil.png marks edge glint zones → secondary polish (metal) or white ink (acrylic).
