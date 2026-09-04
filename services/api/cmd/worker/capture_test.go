package main

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func TestFrameSignatureDeduplicatesStableFrames(t *testing.T) {
	dark := testJPEG(t, color.Gray{Y: 20})
	light := testJPEG(t, color.Gray{Y: 220})
	darkSignature, err := frameSignature(dark)
	if err != nil {
		t.Fatal(err)
	}
	lightSignature, err := frameSignature(light)
	if err != nil {
		t.Fatal(err)
	}
	if difference := signatureDifference(darkSignature, darkSignature); difference != 0 {
		t.Fatalf("same-frame difference = %f", difference)
	}
	if difference := signatureDifference(darkSignature, lightSignature); difference < 100 {
		t.Fatalf("changed-frame difference = %f", difference)
	}
}

func testJPEG(t *testing.T, value color.Color) []byte {
	t.Helper()
	imageValue := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			imageValue.Set(x, y, value)
		}
	}
	var output bytes.Buffer
	if err := jpeg.Encode(&output, imageValue, nil); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}
