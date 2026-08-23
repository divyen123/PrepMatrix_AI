const ACTION_ROWS = [
  {
    group: "idle",
    frameMs: 350,
    pauseMs: 400,
    positions: [
      "1.3393% 0%", "16.5179% 0%", "30.8036% 0%", "44.8661% 0%",
      "58.4821% 0%", "72.5446% 0%", "86.6071% 0%", "99.4420% 0%",
    ],
    clips: [
      "13px 7px 20px 7px", "16px 3px 20px 5px", "15px 3px 20px 3px", "13px 6px 20px 7px",
      "14px 5px 20px 6px", "15px 5px 20px 5px", "15px 6px 20px 6px", "12px 5px 19px 6px",
    ],
  },
  {
    group: "look",
    frameMs: 300,
    pauseMs: 400,
    positions: [
      "1.0045% 12.5000%", "15.6250% 12.5000%", "29.3527% 12.5744%", "44.4196% 12.7232%",
      "59.1518% 12.6488%", "72.8795% 12.5744%", "85.6027% 12.6488%", "99.2188% 12.6488%",
    ],
    clips: [
      "15px 5px 15px 6px", "14px 6px 14px 9px", "18px 0px 17px 0px", "16px 7px 14px 8px",
      "17px 0px 16px 0px", "18px 8px 17px 9px", "18px 6px 17px 7px", "15px 5px 14px 5px",
    ],
  },
  {
    group: "stroll",
    frameMs: 170,
    pauseMs: 350,
    positions: [
      "0.8929% 25.8929%", "15.9598% 25.8929%", "30.5804% 25.9673%", "45.5357% 25.8929%",
      "60.2679% 26.0417%", "72.7679% 26.0417%", "86.4955% 25.8929%", "100% 26.0417%",
    ],
    clips: [
      "17px 0px 16px 2px", "17px 1px 16px 1px", "20px 0px 20px 0px", "17px 0px 18px 0px",
      "15px 7px 13px 8px", "20px 2px 18px 4px", "24px 0px 22px 0px", "13px 12px 12px 21px",
    ],
  },
  {
    group: "celebrate",
    frameMs: 250,
    pauseMs: 400,
    positions: [
      "1.0045% 39.5089%", "16.5179% 39.7321%", "31.4732% 39.4345%", "45.0893% 39.8810%",
      "58.4821% 39.7321%", "72.9911% 39.7321%", "86.6071% 39.8810%", "100% 39.8810%",
    ],
    clips: [
      "12px 1px 11px 2px", "15px 1px 15px 2px", "12px 0px 11px 0px", "17px 4px 15px 7px",
      "17px 5px 15px 6px", "1px 8px 2px 9px", "4px 2px 4px 4px", "5px 2px 5px 5px",
    ],
  },
  {
    group: "rest",
    frameMs: 300,
    pauseMs: 400,
    positions: [
      "1.7857% 53.4226%", "16.7411% 53.2738%", "29.9107% 55.5804%", "45.4241% 55.9524%",
      "59.2634% 53.9435%", "72.8795% 54.0923%", "87.2768% 52.6786%", "99.6652% 53.7202%",
    ],
    clips: [
      "15px 0px 13px 0px", "14px 6px 12px 5px", "50px 0px 49px 2px", "50px 0px 50px 0px",
      "19px 1px 18px 2px", "20px 6px 18px 8px", "23px 3px 22px 4px", "14px 13px 12px 15px",
    ],
  },
  {
    group: "emotion",
    frameMs: 325,
    pauseMs: 400,
    positions: [
      "0.2232% 66.8155%", "15.9598% 66.8155%", "30.1339% 67.1131%", "44.1964% 66.9643%",
      "58.9286% 66.9643%", "73.1027% 67.2619%", "86.6071% 67.2619%", "100% 67.2619%",
    ],
    clips: [
      "15px 4px 15px 7px", "16px 0px 14px 1px", "18px 2px 17px 3px", "18px 5px 16px 5px",
      "15px 0px 15px 0px", "20px 4px 19px 6px", "15px 2px 15px 3px", "17px 5px 17px 5px",
    ],
  },
  {
    group: "personality",
    frameMs: 325,
    pauseMs: 400,
    positions: [
      "1.1161% 80.5060%", "16.7411% 80.8036%", "31.2500% 81.4732%", "44.7545% 80.8036%",
      "59.3750% 81.3988%", "72.9911% 81.2500%", "86.6071% 81.1012%", "99.5536% 81.5476%",
    ],
    clips: [
      "8px 0px 7px 0px", "13px 0px 11px 0px", "21px 0px 20px 0px", "11px 8px 11px 7px",
      "21px 5px 19px 7px", "19px 4px 17px 4px", "16px 4px 15px 4px", "14px 5px 14px 8px",
    ],
  },
  {
    group: "play",
    frameMs: 175,
    pauseMs: 500,
    positions: [
      "1.5625% 95.8333%", "17.4107% 95.6845%", "32.3661% 95.0893%", "45.7589% 94.9405%",
      "58.9286% 95.5357%", "72.5446% 94.1964%", "87.0536% 94.6429%", "99.3304% 95.6101%",
    ],
    clips: [
      "22px 0px 21px 0px", "21px 0px 18px 1px", "10px 0px 10px 1px", "8px 6px 9px 7px",
      "15px 3px 16px 5px", "6px 4px 6px 6px", "16px 3px 16px 3px", "7px 1px 7px 2px",
    ],
  },
];

export const KIDS_PET_ACTION_CYCLE = Object.freeze(ACTION_ROWS.flatMap((row, rowIndex) => (
  row.positions.map((position, columnIndex) => Object.freeze({
    id: `${row.group}-${columnIndex + 1}`,
    group: row.group,
    row: rowIndex,
    column: columnIndex,
    position,
    clip: row.clips[columnIndex],
    durationMs: row.frameMs + (columnIndex === row.positions.length - 1 ? row.pauseMs : 0),
  }))
)));

export const KIDS_PET_ACTION_CYCLE_DURATION_MS = KIDS_PET_ACTION_CYCLE.reduce(
  (total, frame) => total + frame.durationMs,
  0,
);
