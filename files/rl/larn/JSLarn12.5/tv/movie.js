'use strict';

let video;
const EMPTY_LARN_FRAME = "                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                            SAVING GAME                                        \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n                                                                                \n";

// a collection of rolls of film
class Video {
  constructor(gameID) {
    this.frameBuffer = [];
    this.recording = ENABLE_RECORDING;
    this.gameID = gameID;
    this.currentFrameNum = -1;
    this.metadata; // set when game is completed
    this.totalFrames; // total number of frames when replaying
    this.rolls = [];
    this.divs = []; // divs to record
    this.progressCallback; // use this to upload LocalScore info for games in progress
  }

  addRollToBuffer(roll) {
    if (!roll) {
      console.log(`addRollToBuffer(): no roll!`);
      return;
    }

    let firstPatch = roll.patches[0];
    let frameNum = firstPatch.id;

    let prevFrame = this.getFrame(frameNum - 1); // this requires previous rolls to be downloaded

    for (let i = 0; i < roll.patches.length; i++) {
      const patch = roll.patches[i];
      let newFrame = buildFrame(patch, prevFrame);

      if (!newFrame) {
        // console.log(`addRollToBuffer(): null newFrame`, patch);
        continue;
      }

      if (this.metadata && newFrame.id <= this.totalFrames ||
        !this.metadata) {
        this.frameBuffer[newFrame.id] = newFrame;
        prevFrame = newFrame;
      } else {
        // sometimes a couple of extra frames can sneak in
        // but we don't want to show them
        console.log(`addRollToBuffer(): extra frame:`, prevFrame.id);
      }

      if (!this.metadata) this.totalFrames = newFrame.id;
    }

    this.addRoll(roll);
    if (this.rolls.length === 1) {
      play();
    }

    if (this.metadata && prevFrame.id >= this.metadata.frames) {
      console.log(`addRollToBuffer(): done loading`);
      updateMessage(``);
    } else {
      // keep downloading
      // console.log(`addRollToBuffer(): prevFrame != totalframes`, prevFrame.id, this.metadata.frames, this.totalFrames);
      downloadRoll(this, updateProgressBarCallback, waitForNextFile);
    }

  }



  getFrame(frameNum) {
    // console.log(`video.getFrame(): ${frameNum}`);
    
    // build initial frame
    if (frameNum < 0) {
      // console.log(`video.getFrame(): returning blank frame`);
      return this.createEmptyFrame();
    } else {
      // protection for occasional missing frame when returning from saved game
      if (!this.frameBuffer[frameNum]) {
        console.error(`video.getFrame(): missing frame: ${frameNum}`);
        this.frameBuffer[frameNum] = this.createEmptyFrame();
      }
      return this.frameBuffer[frameNum];
    }
  }



  createEmptyFrame() {
    let newFrame = new Frame();
    // populate the first frame with the names of the divs that were recorded
    this.divs.forEach(div => {
      newFrame.divs[div] = ``;
    });
    return newFrame;
  }



  getCurrentRoll() {
    return this.rolls[this.rolls.length - 1];
  }



  addFrame(newFrame) {

    // console.log(`addFrame(): `, newFrame.id);

    let prevFrame = this.getFrame(this.currentFrameNum);

    // console.log(JSON.stringify(prevFrame))
    // console.log(JSON.stringify(newFrame))
    let newPatch = buildPatch(prevFrame, newFrame);

    // don't record empty frames
    let empty = true;
    Object.values(newPatch.divs).forEach(div => {
      empty &= div == ``;
    });
    if (empty) {
      // console.log(`video.addframe(): no change`);
      return;
    }

    let currentRoll = this.getCurrentRoll();
    if (!currentRoll) {
      // console.log(`video.addframe(): creating first roll`);
      currentRoll = new Roll([]);
      this.addRoll(currentRoll);
    }
    // console.log(`video.addframe(): adding frame to roll`);
    currentRoll.addPatch(newPatch);
    if (currentRoll.isFull()) {
      // console.log(`video.addframe(): writing roll`);
      uploadRoll(currentRoll, this.rolls.length - 1, this.progressCallback);
      this.addRoll(new Roll([]));
    }

    this.currentFrameNum = newFrame.id;
    this.frameBuffer[this.currentFrameNum] = newFrame;
  }



  addRoll(roll) {
    this.rolls.push(roll);
  }



  getNextFrame() {
    this.updateCurrentFrame(1);
    let frame = this.getFrame(this.currentFrameNum);
    return frame;
  }



  updateCurrentFrame(amount) {
    if (amount > 0) {
      this.currentFrameNum = Math.min(this.currentFrameNum + amount, this.frameBuffer.length - 1);
    } else {
      this.currentFrameNum = Math.max(this.currentFrameNum + amount, 0);
    }
    return this.currentFrameNum;
  }



  getPreviousFrame() {
    this.updateCurrentFrame(-1);
    let frame = this.getFrame(this.currentFrameNum);
    return frame;
  }



  setTotalFrames(num) {
    this.totalFrames = num;
  }


} /// END VIDEO CLASS



function uploadRoll(roll, num, progressCallback) {
  let progressData;

  if (ENABLE_RECORDING_REALTIME) {
    // progresscallback gets a localscore object from the player so we can update 
    // the list of games in progress
    if (progressCallback) progressData = progressCallback();
    if (progressData) {
      let patch = roll.patches[roll.patches.length - 1];
      if (patch) {
        progressData.frames = patch.id;
      } else {
        console.error(`null patch for roll=${roll.patches.length - 1} num=${num}`)
      }
    } else {
      progressData = null;
      console.log(`uploadroll: progressData=null`);
    }
  }

  let filename = `${num}.json`;
  let file = compressRoll(roll);
  uploadFile(gameID, filename, file, false, JSON.stringify(progressData));
}



// this is called by larn if it can't record (offline/amiga_mode)
function stopRecording() {
  console.log(`stopping recording`);
  if (!video) video = new Video(gameID);
  video.recording = false;
}



function isRecording() {
  if (!navigator.onLine) return false;
  if (!ENABLE_RECORDING) return false;
  if (!video) video = new Video(gameID);
  return video.recording;
}



// this is called by larn
function recordFrame(divs, progressCallback) {

  if (!isRecording()) return;

  if (!video) video = new Video(gameID);

  if (!video.progressCallback) {
    video.progressCallback = progressCallback;
  }

  let newFrame = new Frame();
  newFrame.id = video.currentFrameNum + 1;
  newFrame.ts = Date.now();

  // console.log(`recordFrame(): recording frame: ${newFrame.id}`);

  for (const [key, value] of Object.entries(divs)) {
    // console.log(`recordFrame(): k: ${key}`);
    // console.log(`recordFrame(): v: ${value}`);
    video.divs[key] = ``; // to keep track of the div names that are being recorded
    newFrame.divs[key] = value;
  }

  video.addFrame(newFrame);
}



// this is called by larn
function endRecording(endData, isUlarn) {
  try {
    if (!isRecording()) return;

    let currentRoll = video.getCurrentRoll();
    uploadRoll(currentRoll, video.rolls.length - 1, video.progressCallback);

    // save games don't have endData
    if (endData) {
      // don't write a file with a '+' in it
      if (endData.gameID.slice(-1) === `+`) {
        endData.gameID = endData.gameID.slice(0, -1);
      }
      endData.frames = currentRoll.patches[currentRoll.patches.length - 1].id;
      endData.ularn = isUlarn;

      console.log(`endRecording(): enddata: `, endData);
      console.log(`endRecording(): frames = ${endData.frames}`);
      uploadFile(gameID, `${gameID}.txt`, JSON.stringify(endData), true);
    }
  } catch (error) {
    console.log(`endRecording(): caught: `, error);
  }
}



// this is called by larn
function getRecordingInfo() {

  if (!isRecording()) return;

  let recordingInfo = {
    'frames': video.currentFrameNum,
    'rolls': video.rolls.length,
  };
  // console.log(`getRecordingInfo(): ${JSON.stringify((recordingInfo))}`);
  return recordingInfo;
}



// this is called by larn for reloading from savegames
function setRecordingInfo(info) {

  if (!isRecording()) return;
  if (!info) return;

  video = new Video(video.gameID);
  console.log(`setRecordingInfo(): info: ${JSON.stringify(info)}`);
  video.currentFrameNum = parseInt(info.frames);

  // console.log(`setRecordingInfo(): creating frame ${video.currentFrameNum}`)

  // TODO probably need to initialize divs
  video.frameBuffer[video.currentFrameNum] = new Frame();

  for (let index = 0; index < parseInt(info.rolls); index++) {
    // console.log(`setRecordingInfo(): addroll: ${index}`);
    video.addRoll(new Roll([]));
  }
  video.addRoll(new Roll([]));
}



// this is called by larn
function uploadStyle(style) {
  if (!isRecording()) return;
  // console.log(`setStyle(): style: `, style);
  uploadFile(gameID, `${gameID}.css`, JSON.stringify(style));
}