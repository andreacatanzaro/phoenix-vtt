import { describe, expect, it } from "vitest";
import { readImageInfo } from "./image-info";
import { fakeJpeg, fakePng, fakeWebp } from "./test-support";

describe("readImageInfo", () => {
  it("reads the type and size of a PNG, a JPEG and a WebP", () => {
    expect(readImageInfo(fakePng(1200, 800))).toEqual({ mime: "image/png", width: 1200, height: 800 });
    expect(readImageInfo(fakeJpeg(640, 480))).toEqual({ mime: "image/jpeg", width: 640, height: 480 });
    expect(readImageInfo(fakeWebp(2048, 1024))).toEqual({ mime: "image/webp", width: 2048, height: 1024 });
  });

  it("reads a lossy and a lossless WebP", () => {
    const lossy = Buffer.alloc(30);
    lossy.write("RIFF", 0, "ascii");
    lossy.write("WEBPVP8 ", 8, "ascii");
    lossy[23] = 0x9d;
    lossy[24] = 0x01;
    lossy[25] = 0x2a;
    lossy.writeUInt16LE(321, 26);
    lossy.writeUInt16LE(123, 28);
    expect(readImageInfo(lossy)).toEqual({ mime: "image/webp", width: 321, height: 123 });
    const lossless = Buffer.alloc(30);
    lossless.write("RIFF", 0, "ascii");
    lossless.write("WEBPVP8L", 8, "ascii");
    lossless[20] = 0x2f;
    const bits = (500 - 1) | ((300 - 1) << 14);
    lossless.writeUInt32LE(bits >>> 0, 21);
    expect(readImageInfo(lossless)).toEqual({ mime: "image/webp", width: 500, height: 300 });
  });

  it("finds the size of a JPEG that has other segments first", () => {
    const b = fakeJpeg(333, 222);
    expect(readImageInfo(b)).toMatchObject({ width: 333, height: 222 });
  });

  it("refuses anything else: text, an empty file, a truncated picture, a zero size", () => {
    expect(readImageInfo(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(readImageInfo(Buffer.alloc(0))).toBeNull();
    expect(readImageInfo(fakePng(10, 10).subarray(0, 20))).toBeNull();
    expect(readImageInfo(fakePng(0, 10))).toBeNull();
    expect(readImageInfo(Buffer.from("GIF89a....................................."))).toBeNull();
    expect(readImageInfo(Buffer.from("RIFF....WAVEfmt ..................."))).toBeNull();
  });
});
