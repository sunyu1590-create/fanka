"use client";

/**
 * 三维地球贴图：用 Natural Earth 110m 陆地轮廓在等距圆柱投影上一次性栅格化。
 * 只生成一次，作为普通纹理复用；不在每帧绘制，也不请求任何外部瓦片。
 */

import * as THREE from "three";
import { WORLD_LAND } from "./world-land";

const WIDTH = 2048;
const HEIGHT = 1024;

/** 经纬度 → 画布像素。 */
function project(lon: number, lat: number) {
  return [((lon + 180) / 360) * WIDTH, ((90 - lat) / 180) * HEIGHT] as const;
}

export function buildLandTexture(mode: "dark" | "light") {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // 海洋：低饱和深色，带极轻微的纬度渐变。
  const ocean = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  if (mode === "dark") {
    // 海洋比陆地略亮一点：深石墨陆地在暗色背景里才能读成“陆地”，
    // 反过来（陆地比海洋亮）会像一张发光的等高线图。
    ocean.addColorStop(0, "#16212a");
    ocean.addColorStop(0.5, "#13202a");
    ocean.addColorStop(1, "#15222b");
  } else {
    ocean.addColorStop(0, "#dbe6e8");
    ocean.addColorStop(0.5, "#cfdcdd");
    ocean.addColorStop(1, "#d7e3e4");
  }
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 陆地填充。跨 180° 经线的段要拆开，否则会横穿整张图。
  ctx.fillStyle = mode === "dark" ? "#0b1014" : "#a9b8ba";
  for (const polygon of WORLD_LAND) {
    ctx.beginPath();
    for (const ring of polygon) {
      let started = false;
      let previousLon: number | null = null;
      for (const [lon, lat] of ring) {
        if (previousLon != null && Math.abs(lon - previousLon) > 180) {
          started = false;
        }
        const [x, y] = project(lon, lat);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
        previousLon = lon;
      }
      ctx.closePath();
    }
    ctx.fill();
  }

  // 海岸线：1px 亮边，让大陆轮廓在远处也能辨认。
  ctx.strokeStyle = mode === "dark" ? "rgba(150,196,206,0.42)" : "rgba(60,92,98,0.42)";
  ctx.lineWidth = 1.2;
  for (const polygon of WORLD_LAND) {
    for (const ring of polygon) {
      let started = false;
      let previousLon: number | null = null;
      for (const [lon, lat] of ring) {
        if (previousLon != null && Math.abs(lon - previousLon) > 180) started = false;
        const [x, y] = project(lon, lat);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
        previousLon = lon;
      }
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/**
 * 国家/地区粗粒度中心点。只用于把真实 country 字段落到地图上，
 * 不参与热度生成；没有 country 的数据不绘制。
 */
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  CN: [105, 35], HK: [114.2, 22.3], MO: [113.5, 22.2], TW: [121, 23.7],
  US: [-98, 39], CA: [-106, 56], MX: [-102, 23], BR: [-52, -10], AR: [-64, -34], CL: [-71, -33],
  GB: [-2, 54], IE: [-8, 53], FR: [2, 47], DE: [10, 51], NL: [5.5, 52], BE: [4.5, 50.5],
  ES: [-4, 40], PT: [-8, 39.5], IT: [12.5, 42.5], CH: [8, 47], AT: [14, 47.5], SE: [15, 60],
  NO: [9, 61], FI: [26, 64], DK: [10, 56], PL: [19, 52], CZ: [15, 50], GR: [22, 39],
  RU: [90, 60], UA: [32, 49], TR: [35, 39], SA: [45, 24], AE: [54, 24], IL: [35, 31],
  IN: [79, 22], PK: [69, 30], BD: [90, 24], TH: [101, 15], VN: [106, 16], MY: [102, 4],
  SG: [103.8, 1.35], ID: [113, -2], PH: [122, 12], JP: [138, 36], KR: [128, 36], KP: [127, 40],
  AU: [134, -25], NZ: [172, -41], ZA: [24, -29], EG: [30, 27], NG: [8, 9], KE: [38, 0],
  ET: [39, 9], MA: [-7, 32], DZ: [3, 28], GH: [-1, 8], TZ: [35, -6], UG: [32, 1],
};
