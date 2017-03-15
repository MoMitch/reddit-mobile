import React from 'react';
import dashjs from 'dashjs';

import './styles.less';

const T = React.PropTypes;

class HTML5StreamPlayer extends React.Component {
  static propTypes = {
    // ownProps
    manifestSource: T.string.isRequired,
    manifestType: T.string.isRequired,
    aspectRatioClassname: T.string.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = {
      videoPaused: false,
      videoMuted: true,
      videoPosition: 0,
      videoEnded: false,
      videoFullScreen: false,
    };
  }

  handleChange = () => {
    if (window.orientation !== 0) {
      this.enterFullScreen();
    }
  }

  handleFullScreenEvent = () => {
    var state = document.fullScreen || document.mozFullScreen || document.webkitIsFullScreen;
    var event = state ? 'FullscreenOn' : 'FullscreenOff';


    this.setState({videoFullScreen: state});
    // Now do something interesting
    console.log('Event: ' + event + ' State: ' + state);    
  }

  componentDidMount() {
    //if non-hls compatible browser, initialize dashjs media player
    if (!document.createElement('video').canPlayType('application/dash+xml') !== '') {
      console.log("INTIALIZING!");
      let player = dashjs.MediaPlayerFactory.create(this.refs['HTML5StreamPlayerVideo']);
    }
    if ('onorientationchange' in window) {
      window.addEventListener("orientationchange", this.handleChange, false);
    }
    //listen for full screen events (exit/enter)
    document.addEventListener("fullscreenchange", this.handleFullScreenEvent, false);
    document.addEventListener("mozfullscreenchange", this.handleFullScreenEvent, false);
    document.addEventListener("webkitfullscreenchange", this.handleFullScreenEvent, false);

    //draw initial buffer background (null video);
    this.drawBufferBar();
  }

  componentWillUnmount() {
    let video = this.refs['HTML5StreamPlayerVideo'];
    window.removeEventListener("orientationchange", this.handleChange, false);
  }

  playPauseVideo = () => {
    let video = this.refs['HTML5StreamPlayerVideo'];

    if (video.paused) {
      console.log("Unpausing Video");
      video.play();
      this.setState({videoPaused: false});
    } else {
      console.log("Pausing Video");
      video.pause();
      this.setState({videoPaused: true});
    }
  }

  resetVideo = () => {
    let video = this.refs['HTML5StreamPlayerVideo'];

    video.currentTime = 0;
  }

  enterFullScreen = () => {
    let video = this.refs['HTML5StreamPlayerVideo'];

    if (video.requestFullscreen) {
      video.requestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    } else if (video.mozRequestFullScreen) {
      video.mozRequestFullScreen(); // Firefox
    } else if (video.webkitRequestFullscreen) {
      video.webkitRequestFullscreen(); // Chrome and Safari
    }
  }

  muteVideo = () => {
    let video = this.refs['HTML5StreamPlayerVideo'];
    video.muted = !video.muted;
    this.setState({videoMuted: video.muted});
  }

  renderMute() {
    if (this.state.videoMuted) {
      return(<span className={ `HTML5StreamPlayer__playback-un-mute icon icon-un-mute` } />);
    } else {
      return(<span className={ `HTML5StreamPlayer__playback-mute icon icon-mute` } />);
    }
  }

  renderPlaybackIcon() {
    let video = this.refs['HTML5StreamPlayerVideo'];

    let videoState = this.state.videoPaused;
    //check for video out of sync, this happens when user blocks autoplay videos etc,
    //will be realigned on next play/pause event
    if (!video || video.paused && video.paused === !this.state.videoPaused) {
      videoState = true;
    }

    if (this.state.videoEnded) {
      return (
        <div className={ `HTML5StreamPlayer__playback-action-circle regular` }>
          <span className={ `HTML5StreamPlayer__playback-action-icon white icon icon-replay` } />
        </div>
      );
    } else if (videoState) {
      return (
        <div className={ `HTML5StreamPlayer__playback-action-circle regular` }>
          <span className={ `HTML5StreamPlayer__playback-action-icon white icon icon-play_triangle` } />
        </div>
      );
    } else {
      return null;
    }
  }

  setVideoPos = (event) => {
    let video = this.refs['HTML5StreamPlayerVideo'];
    let value = event.target.value;

    this.setState({videoPosition: value});
    video.currentTime = (video.duration/100) * value;
  }

  drawBufferBar(video = null) {
    let bufferBar = this.refs['scrubBuffer'];
    let context = bufferBar.getContext('2d');

    context.fillStyle = '#CCCCCA';
    context.fillRect(0, 0, bufferBar.width, bufferBar.height);
    context.fillStyle = '#939393';
    context.strokeStyle = '#939393';

    if (video) {
      var inc = bufferBar.width / video.duration;

      //draw buffering each update
      for (var i = 0; i < video.buffered.length; i++) {
        var startX = video.buffered.start(i) * inc;
        var endX = video.buffered.end(i) * inc;
        var width = endX - startX;

        console.log(`start: ${startX} end: ${endX} width: ${width}`);

        context.fillRect(startX, 0, width, bufferBar.height);
        context.rect(startX, 0, width, bufferBar.height);
        context.stroke();
      }

      let elapsedTime = video.currentTime / video.duration;
      context.fillStyle = '#0DD3BB';
      context.fillRect(0, 0, bufferBar.width * elapsedTime, bufferBar.height);
    }
  }

  updateTime = () => {
    //Create buffer bar for data
    let video = this.refs['HTML5StreamPlayerVideo'];
    this.drawBufferBar(video);

    if (video.currentTime && video.duration) {
      let isVideoEnded = false;
      if (video.currentTime === video.duration) {
        isVideoEnded = true;
      }

      this.setState({videoPosition: ((video.currentTime/video.duration) * 100), videoEnded:isVideoEnded});
    }
  }

  consoleLoggos = () => {
    let video = this.refs['HTML5StreamPlayerVideo'];
  }

  render() {

    return (
      <div className = 'HTML5StreamPlayer' ref='HTML5StreamPlayerContainer'>
        <div className = {`HTML5StreamPlayer__videoContainer`}>
         
          <div className = {`HTML5StreamPlayer__videoTrim ${this.props.aspectRatioClassname}`}>
            <video autoPlay={true} muted={this.state.videoMuted} onTimeUpdate={this.updateTime} preload="metadata" playsInline={true} className = {this.state.videoFullScreen ? 'HTML5StreamPlayer__video' : 'HTML5StreamPlayer__video__regular'} ref='HTML5StreamPlayerVideo'>
              <source src={this.props.mpegDashSource} type={'application/dash+xml'}/>
              <source src={this.props.hlsSource} type={'vnd.apple.mpegURL'}/>
            </video>
          </div>
          
          <div className = 'HTML5StreamPlayer__controlPanel' id="html5-video-stream-controls">
            
            <div className = 'HTML5StreamPlayer__control__play'>
              <button className = {'HTML5StreamPlayer__control__play'} onClick={this.playPauseVideo}>
                {this.renderPlaybackIcon()}
              </button>
            </div>

            <div className = 'HTML5StreamPlayer__control__bar'>
                           
              <div className = 'HTML5StreamPlayer__control__fullscreen'>
                <button onClick={this.enterFullScreen}>
                  <span className={ `HTML5StreamPlayer__playback-full-screen icon icon-full-screen` } />
                </button>
              </div>

              <div className = 'HTML5StreamPlayer__control__mute'>
                <button onClick={this.muteVideo}>
                  {this.renderMute()}
                </button>
              </div>

              <div className = 'HTML5StreamPlayer__control__scrubberContainer'>
                
                <canvas ref="scrubBuffer" className = {"HTML5StreamPlayer__control__scrubBar__buffer"}>
                </canvas>

                <input
                  type="range"
                  step="any"
                  value = {this.state.videoPosition}
                  className = "HTML5StreamPlayer__control__scrubBar"
                  onInput={this.setVideoPos}
                  onChange={this.setVideoPos}
                />
              </div>
            </div>
          </div>
        </div>

      </div>
    );
  }

}

export default HTML5StreamPlayer;
