// Draws the app icons (the yin-yang tanuki mark) into icons/.
// Usage: swift tools/icon.swift
import AppKit

let ink = NSColor(srgbRed: 0x26 / 255, green: 0x26 / 255, blue: 0x2E / 255, alpha: 1).cgColor
let cream = NSColor(srgbRed: 0xF6 / 255, green: 0xF1 / 255, blue: 0xE7 / 255, alpha: 1).cgColor
let red = NSColor(srgbRed: 0xE2 / 255, green: 0x57 / 255, blue: 0x4A / 255, alpha: 1).cgColor

// The mark is drawn on a 24-unit grid, like the inline SVG in index.html.
func mark(_ g: CGContext) {
  func disc(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ c: CGColor) {
    g.setFillColor(c)
    g.fillEllipse(in: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r))
  }
  g.setFillColor(cream)
  for ear in [[(4.2, 8.2), (3.6, 2.2), (9.0, 4.6)], [(19.8, 8.2), (20.4, 2.2), (15.0, 4.6)]] {
    g.move(to: CGPoint(x: ear[0].0, y: ear[0].1))
    g.addLine(to: CGPoint(x: ear[1].0, y: ear[1].1))
    g.addLine(to: CGPoint(x: ear[2].0, y: ear[2].1))
    g.closePath()
    g.fillPath()
  }
  disc(12, 13.5, 9.5, ink)
  g.saveGState()
  g.clip(to: CGRect(x: 12, y: 0, width: 12, height: 24))
  disc(12, 13.5, 9.5, cream)
  g.restoreGState()
  disc(12, 18.25, 4.75, cream)
  disc(12, 8.75, 4.75, ink)
  disc(12, 8.75, 1.5, red)
  disc(12, 18.25, 1.5, ink)
  g.setStrokeColor(cream)
  g.setLineWidth(0.8)
  g.strokeEllipse(in: CGRect(x: 2.5, y: 4, width: 19, height: 19))
}

// corner: radius of the background as a share of the size; scale: size of the mark as a share of the size
func icon(_ name: String, size: Int, corner: CGFloat, scale: CGFloat) {
  let s = CGFloat(size)
  let g = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  g.translateBy(x: 0, y: s)
  g.scaleBy(x: 1, y: -1)
  g.setFillColor(ink)
  g.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: s, height: s), cornerWidth: s * corner, cornerHeight: s * corner, transform: nil))
  g.fillPath()
  let k = s * scale / 24
  g.translateBy(x: s / 2 - 12 * k, y: s / 2 - 12.6 * k)
  g.scaleBy(x: k, y: k)
  mark(g)
  let png = NSBitmapImageRep(cgImage: g.makeImage()!).representation(using: .png, properties: [:])!
  try! png.write(to: URL(fileURLWithPath: "icons/\(name).png"))
  print("icons/\(name).png  \(size)px")
}

icon("icon-192", size: 192, corner: 0.22, scale: 0.72)
icon("icon-512", size: 512, corner: 0.22, scale: 0.72)
icon("icon-maskable-512", size: 512, corner: 0, scale: 0.56)   // keeps the mark inside the safe zone
icon("apple-touch-icon", size: 180, corner: 0, scale: 0.72)    // iOS rounds the corners itself
