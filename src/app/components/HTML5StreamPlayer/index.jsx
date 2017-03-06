import React from 'react';
import dashjs from 'dashjs';

import './styles.less';

const T = React.PropTypes;

class HTML5StreamPlayer extends React.Component {
  static propTypes = {
    // ownProps
    manifestSource: T.string.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = {
      mediaPlayer: null,
      inlineVideo: true,
    };
  }

  componentDidMount() {
    //if non-hls compatible browser, initialize dashjs media player
    if (!document.createElement('video').canPlayType('application/vnd.apple.mpegURL') !== '') {
      let player = dashjs.MediaPlayerFactory.create(this.refs['HTML5StreamPlayerVideo']);
      this.setState({mediaPlayer: player});
    }

    // let video = this.refs['HTML5StreamPlayerVideo'];
    // video.play();
  }

  playPauseVideo = () => {
    let video = this.refs['HTML5StreamPlayerVideo'];

    console.log("Testing pause/play");
    if (video.paused) {
      console.log("Unpausing Video");
      video.play();
    } else {
      console.log("Pausing Video");
      video.pause();
    }
  }

  resetVideo = () => {
    let video = this.refs['HTML5StreamPlayerVideo'];

    video.currentTime = 0;
  }

  fullScreenToggle = () => {
    let video = this.refs['HTML5StreamPlayerVideo'];

    if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    } else if (video.requestFullscreen) {
      video.requestFullscreen();
    } else if (video.mozRequestFullScreen) {
      video.mozRequestFullScreen(); // Firefox
    } else if (video.webkitRequestFullscreen) {
      video.webkitRequestFullscreen(); // Chrome and Safari
    }
  }

  muteVideo = () => {
    let video = this.refs['HTML5StreamPlayerVideo'];
    video.muted = !video.muted;
  }

  // onVideoEnded = () => {

  // }

  // document.getElementById('myVideo').addEventListener('ended',myHandler,false);
  //   function myHandler(e) {
  //       // What you want to do after the event
  //   }

  render() {
    let videoType = null;
    //if hls compatible browser use standard hls, else, dash
    if (document.createElement('video').canPlayType('application/vnd.apple.mpegURL') !== '') {
      videoType = 'application/vnd.apple.mpegURL';
    } else {
      videoType = 'application/dash+xml';
    }
    console.log("TEST!");
    return (
      <div className = 'HTML5StreamPlayer' ref='HTML5StreamPlayerContainer'>
        
        {/*<div>
          <video controls playsInline={true} className = 'HTML5StreamPlayer__video' ref='HTML5StreamPlayerVideo'>
            <source src={this.props.manifestSource} type={videoType}/>
          </video>
        </div>*/}

        <div className = 'HTML5StreamPlayer__videoContainer'>
          <video controls playsInline={true} className = 'HTML5StreamPlayer__video' ref='HTML5StreamPlayerVideo'>
            <source src={this.props.manifestSource} type={videoType}/>
          </video>
        </div>
        
        <div className = 'HTML5StreamPlayer__controlPanel' id="html5-video-stream-controls">
          <div className = 'HTML5StreamPlayer__control'>
            <button onClick={this.playPauseVideo}>
              Play/Pause
            </button>
          </div>

          <div className = 'HTML5StreamPlayer__control'>
            <button onClick={this.fullScreenToggle}>
              FullScreen
            </button>
          </div>

        </div>
        {/*\
          <div>
            <button onClick={this.resetVideo}>
              Replay
            </button>
          </div>


          <div>
            <button onClick={this.muteVideo}>
              Mute/Unmute
            </button>
          </div>

        </div>*/}
      </div>
    );
  }

}

export default HTML5StreamPlayer;
