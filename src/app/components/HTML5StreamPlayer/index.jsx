import React from 'react';
import dashjs from 'dashjs';
import { debounce } from 'lodash';
import './styles.less';
import PostModel from 'apiClient/models/PostModel';
import { trackVideoEvent } from 'app/actions/posts';
import { connect } from 'react-redux';
import { VIDEO_EVENT } from 'app/constants';
import { createSelector } from 'reselect';
import { isCommentsPage } from 'platform/pageUtils';

const T = React.PropTypes;
const vector_path_play_icon = 'M6,3 L21,10.5 21,25.5 6,33 6,3 M21,10.5 L36,18 36,18 21,25.5 21,10.5';
const vector_path_pause_icon = 'M3,3 L15,3 15,33 3,33 3,3 M19,3 L31,3 31,33 19,33 19,3';

class HTML5StreamPlayer extends React.Component {
  static propTypes = {
    // ownProps
    hlsSource: T.string.isRequired,
    mpegDashSource: T.string.isRequired,
    aspectRatioClassname: T.string.isRequired,
    postData: T.instanceOf(PostModel),
    onUpdatePostPlaytime: T.func.isRequired,
    scrubberThumbSource: T.string.isRequired,
    isGif: T.bool.isRequired,
    isVertical: T.bool.isRequired,
    kDuration: T.number.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = {
      videoScrollPaused: false,
      videoMuted: true,
      videoFullScreen: false,
      debounceFunc: null,
      videoWasInView: false,
      currentTime: '00:00',
      totalTime: '00:00',
      currentlyScrubbing: false,
      scrubPosition: 0,
      thumbPosition: 0,
      mediaPlayer: null,
      videoLoaded: false,
      autoPlay: true,
      lastUpdate: null,
      totalServedTime: 0,
      isLoading: false,
      controlsHidden: true,
      wasPlaying: null,
      controlTimeout: null,
      resumeAfterFullscreen: false,
      lastResumeAfterFullscreen: true,
    };
  }

  getMobileOperatingSystem() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    if (/android/i.test(userAgent)) {
      return 'Android';
    }
    // iOS detection from: http://stackoverflow.com/a/9039885/177710
    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      return 'iOS';
    }

    return 'unknown';
  }

  isIOS() {
    return (this.getMobileOperatingSystem() === 'iOS');
  }

  isAndroid() {
    return (this.getMobileOperatingSystem() === 'Android');
  }

  safeVideoTime(num) {
    if (isNaN(num)
      || num === null
      || num === undefined
      || num === Number.POSITIVE_INFINITY
      || num === Number.NEGATIVE_INFINITY) {
      return 0;
    }

    return num;
  }

  startToggleControlsTimer() {
    clearTimeout(this.state.controlTimeout);
    const controlTimeout = window.setTimeout(() => {
      if (this.state.controlsHidden === false && this.props.isGif === false) {
        this.toggleControls();
      }
    }, 2500);
    this.setState({controlTimeout});
  }

  toggleControls = () => {
    if (this.props.isGif === true) {
      //is gif
      if (this.state.videoFullScreen === true) {
        this.exitFullscreen();
      } else {
        this.enterFullScreen();
      }
    }

    if (this.state.controlsHidden === false) {
      this.startToggleControlsTimer();
    }
    this.setState({controlsHidden: !this.state.controlsHidden});
  }

  isScrolledIntoView = () => {
    if (this.state.videoFullScreen) {
      return;
    }
    const video = this.HTML5StreamPlayerVideo;
    const videoContainer = this.HTML5StreamPlayerContainer;

    const elemTop = videoContainer.getBoundingClientRect().top;
    const elemBottom = videoContainer.getBoundingClientRect().bottom;

    const totalVideoHeight = elemBottom - elemTop;
    let videoHeight;

    if (elemTop < 0) {
      videoHeight = elemBottom;
    } else if (elemBottom > window.innerHeight) {
      videoHeight = innerHeight - elemTop;
    } else {
      videoHeight = totalVideoHeight;
    }

    let videoIsInView = false;
    let isLoading = this.state.isLoading;
    let player = this.state.mediaPlayer;
    if ((videoHeight / totalVideoHeight) > 0.8) {
      videoIsInView = true;
      //Sometimes loading videos fails if the component is out of our view, ensure load
      if (video.readyState === 0
        && this.state.isLoading === false
        && this.state.videoLoaded === false) {
        player = dashjs.MediaPlayerFactory.create(video);
        video.load();
        isLoading = true;
      }
    }

    if (this.state.videoWasInView !== videoIsInView
      && videoIsInView === true
      && this.videoIsPaused() === true
      && this.state.videoScrollPaused === false) {
      video.play();
      this.sendTrackVideoEvent(VIDEO_EVENT.SCROLL_AUTOPLAY);
    }

    if (this.videoIsPaused() === false && videoIsInView === false) {
      video.pause();
      this.sendTrackVideoEvent(VIDEO_EVENT.SCROLL_PAUSE);
    }

    this.setState({videoWasInView: videoIsInView, videoScrollPaused: false, isLoading, mediaPlayer: player});
  }

  secondsToMinutes(seconds) {
    let minutes = Math.floor(seconds/60).toString();
    let seconds2 = Math.trunc(seconds%60).toString();

    if (minutes.length === 1) { minutes = `0${minutes}`; }
    if (seconds2.length === 1) { seconds2 = `0${seconds2}`; }

    return `${minutes}:${seconds2}`;
  }

  videoDidLoad = () => {
    if (this) {
      if (this.state.videoLoaded === true) {
        return;
      }

      const video = this.HTML5StreamPlayerVideo;
      if (this.props.postData.videoPlaytime > 0) {
        this.setState({
          videoLoaded: true,
          totalServedTime: this.props.postData.videoPlaytime * 1000.0,
          videoWasInView: false,
        });
        this.sendTrackVideoEvent(VIDEO_EVENT.CHANGED_PAGETYPE, this.getPercentServed());
        video.currentTime = this.safeVideoTime(this.props.postData.videoPlaytime);
      } else {
        this.setState({
          videoLoaded: true,
          videoWasInView: false,
        });
      }

      if (this.state.autoPlay === true
        || this.props.postData.videoPlaytime > 0
        && this.videoIsPaused() === true) {
        this.isScrolledIntoView();
      }
    }
  }

  componentDidMount() {
    /*if non-hls compatible browser, initialize dashjs media player
    (dash.js handles this check automatically).*/
    const video = this.HTML5StreamPlayerVideo;
    const seekThumb = this.seekThumb;
    document.addEventListener('webkitfullscreenchange', this.exitHandler, false);
    document.addEventListener('mozfullscreenchange', this.exitHandler, false);
    document.addEventListener('fullscreenchange', this.exitHandler, false);
    document.addEventListener('MSFullscreenChange', this.exitHandler, false);

    // Add an event handler for seek events
    if (seekThumb) {
      //Passive event listeners only available on modern browsers - increases scroll performance
      let passiveSupported = false;
      try {
        const options = Object.defineProperty({}, 'passive', {
          get: function() {
            passiveSupported = true;
          },
        });

        window.addEventListener('test', null, options);
      } catch (err) { return; }

      seekThumb.addEventListener('touchstart', this.scrubStart, passiveSupported ? { passive: true } : false);
      seekThumb.addEventListener('touchend', this.scrubEnd, passiveSupported ? { passive: true } : false);
      seekThumb.addEventListener('touchcancel', this.scrubEnd, passiveSupported ? { passive: true } : false);
      seekThumb.addEventListener('touchmove', this.setVideoPos, passiveSupported ? { passive: true } : false);
    }

    video.addEventListener('canplay', this.videoDidLoad, false);
    video.addEventListener('ended', this.updateTime, false);
    video.addEventListener('webkitendfullscreen', this.onVideoEndsFullScreen, false);

    //sometimes the video will be ready before didMount, in this case, submit 'canplay' manually
    if (video.readyState >= 3) {
      this.videoDidLoad();
    } else if (video.readyState === 0) {
      this.isScrolledIntoView();
    }

    //draw initial buffer background (null video);
    this.drawBufferBar();

    const debounceFunc = debounce(this.isScrolledIntoView, 50);
    window.addEventListener('scroll', debounceFunc);

    //store function handler for removal
    this.setState({debounceFunc, mediaPlayer: null});
  }

  componentWillMount() {
    /*if video has a previous time position, prevent autoplay,
    this stops the video from continuing unintentionally on report modal open/close*/
    if (this.props.postData.videoPlaytime) {
      this.setState({
        autoPlay: false,
        totalTime: this.secondsToMinutes(this.safeVideoTime(this.props.kDuration)),
      });
      return;
    }
    this.setState({
      totalTime: this.secondsToMinutes(this.safeVideoTime(this.props.kDuration)),
    });
  }

  componentWillUnmount() {
    if (this.state.totalServedTime > 0) {
      //Video has been watched and we are now removing it.
      this.sendTrackVideoEvent(VIDEO_EVENT.SERVED_VIDEO, this.getPercentServed());
    }
    const video = this.HTML5StreamPlayerVideo;
    const seekThumb = this.seekThumb;

    video.removeEventListener('canplay', this.videoDidLoad, false);
    video.removeEventListener('ended', this.updateTime, false);
    video.removeEventListener('webkitendfullscreen', this.onVideoEndsFullScreen, false);
    window.removeEventListener('scroll', this.state.debounceFunc, false);

    // Add an event handler for seek events
    if (seekThumb) {
      seekThumb.removeEventListener('touchstart', this.scrubStart, false);
      seekThumb.removeEventListener('touchend', this.scrubEnd, false);
      seekThumb.removeEventListener('touchcancel', this.scrubEnd, false);
      seekThumb.removeEventListener('touchmove', this.setVideoPos, false);
    }

    document.removeEventListener('webkitfullscreenchange', this.exitHandler, false);
    document.removeEventListener('mozfullscreenchange', this.exitHandler, false);
    document.removeEventListener('fullscreenchange', this.exitHandler, false);
    document.removeEventListener('MSFullscreenChange', this.exitHandler, false);
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.videoFullScreen !== this.state.videoFullScreen) {
      //Entered or exited fullscreen, send page type event
      this.sendTrackVideoEvent(VIDEO_EVENT.CHANGED_PAGETYPE, this.getPercentServed());
    }
  }

  //paused attribute and 'currently paused' are two different states, must check for additional conditions
  videoIsPaused() {
    const video = this.HTML5StreamPlayerVideo;

    if (!video) {
      return true;
    }

    const videoIsReady = (video.readyState === 3 || video.readyState === 4);
    const videoLoadedSuccessfully = video.error === null;

    const videoIsPlaying = !video.paused && !video.ended && videoIsReady && videoLoadedSuccessfully;
    return !videoIsPlaying;
  }

  playPauseVideo = (event) => {
    //If controls are hidden, return and let toggle controls take event
    if (this.state.controlsHidden === true) {
      return;
    }

    //Prevent the tap of parent objects (toggles controls)
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();

    const video = this.HTML5StreamPlayerVideo;
    if (this.videoIsPaused()) {
      if ((this.safeVideoTime(video.currentTime) >= this.safeVideoTime(video.duration) || video.ended)) {
        this.resetVideo();
        this.sendTrackVideoEvent(VIDEO_EVENT.REPLAY);
      } else {
        const animation = this.playPauseAnimation;
        video.pause();
        animation.beginElement();
        this.sendTrackVideoEvent(VIDEO_EVENT.PLAY);
      }
      video.play();
      this.setState({videoScrollPaused: false, wasPlaying:true});
    } else {
      const animation = this.playPauseAnimation;
      video.pause();
      animation.beginElement();
      this.setState({videoScrollPaused: true, wasPlaying:false});
      this.sendTrackVideoEvent(VIDEO_EVENT.PAUSE);
    }

    this.startToggleControlsTimer();
  }

  resetVideo = () => {
    const video = this.HTML5StreamPlayerVideo;
    video.currentTime = 0.01;
    this.updateTime();
  }

  exitHandler = () => {
    if (this.state.videoFullScreen === true) {
      this.setState({videoFullScreen: false});
      this.exitFullscreen();
    } else {
      this.setState({videoFullScreen: true});
    }

    if (this.state.wasPlaying === true || this.props.isGif === true) {
      const video = this.HTML5StreamPlayerVideo;
      video.play();
    }

  }

  fullscreenPaused = () => {
    const video = this.HTML5StreamPlayerVideo;
    //Keep track of a pause event that occurs on 'done' event
    //(listener added while fullscreen, event fires after fullscreen exit)
    if (!video.webkitDisplayingFullscreen && this.isIOS()) {
      this.setState({ resumeAfterFullscreen: true, lastResumeAfterFullscreen: this.state.resumeAfterFullscreen });
    } else {
      this.setState({ lastResumeAfterFullscreen: false });
    }
  }

  fullscreenPlayed = () => {
    const video = this.HTML5StreamPlayerVideo;
    //Keep track of a pause event that occurs on 'done' event
    //(listener added while fullscreen, event fires after fullscreen exit)
    this.setState({ resumeAfterFullscreen: true, lastResumeAfterFullscreen: this.state.lastResumeAfterFullscreen });
  }

  onVideoEndsFullScreen = () => {
    const video = this.HTML5StreamPlayerVideo;
    //The iOS 'done' button forces a video pause, this ensure the video continues afterwards
    const resumeVideo = (this.state.lastResumeAfterFullscreen === true || this.props.isGif);
    if (resumeVideo) {
      video.play();
    }
    this.setState({ resumeAfterFullscreen:false, lastResumeAfterFullscreen: true, wasPlaying: resumeVideo });
    this.render();
    //Ensure we animate to correct icon
    const animation = this.playPauseAnimation;
    animation.beginElement();
  }

  exitFullscreen = () => {
    //Default to standard video controls in fullscreen for iOS
    const video = this.HTML5StreamPlayerVideo;
    video.removeEventListener('pause', this.fullscreenPaused, false);
    video.removeEventListener('play', this.fullscreenPlayed, false);

    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
    this.startToggleControlsTimer();
  }

  enterFullScreen = () => {
    //If controls are hidden, return and let toggle controls take event
    if (this.state.controlsHidden === true && this.props.isGif === false) {
      this.toggleControls();
      return;
    }
    //Default to standard video controls in fullscreen for iOS
    const video = this.HTML5StreamPlayerVideo;
    video.addEventListener('pause', this.fullscreenPaused, false);
    video.addEventListener('play', this.fullscreenPlayed, false);

    if (video.requestFullscreen) {
      video.requestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    } else if (video.mozRequestFullScreen) {
      video.mozRequestFullScreen(); // Firefox
    } else if (video.webkitRequestFullscreen) {
      video.webkitRequestFullscreen(); // Chrome and Safari
    }

    if (this.state.videoMuted) {
      video.muted = !video.muted;
    }

    this.setState({
      videoMuted: video.muted,
      resumeAfterFullscreen: !this.videoIsPaused(),
      lastResumeAfterFullscreen: !this.videoIsPaused(),
    });
    this.sendTrackVideoEvent(VIDEO_EVENT.FULLSCREEN);
    this.startToggleControlsTimer();
  }

  muteVideo = () => {
    if (this.state.controlsHidden === true) {
      this.toggleControls();
      return;
    }

    const video = this.HTML5StreamPlayerVideo;

    if (video.muted) {
      this.sendTrackVideoEvent(VIDEO_EVENT.UNMUTE);
    } else {
      this.sendTrackVideoEvent(VIDEO_EVENT.MUTE);
    }

    video.muted = !video.muted;
    this.setState({videoMuted: video.muted});
    this.startToggleControlsTimer();
  }

  renderMute() {
    //if gif, no mute button
    if (this.props.isGif) {
      return;
    }

    const video = this.HTML5StreamPlayerVideo;
    if ((video && video.muted) || this.state.videoMuted) {
      return (<span className={ 'HTML5StreamPlayer__playback-mute icon icon-mute' } />);
    }

    return (<span className={ 'HTML5StreamPlayer__playback-unmute icon icon-unmute' } />);
  }

  renderPlaybackIcon() {

    const video = this.HTML5StreamPlayerVideo;
    if ((this.safeVideoTime(video.currentTime) >= this.safeVideoTime(video.duration) || video.ended)
      && this.props.isGif === false) {
      return (
        <div onClick = { (event) => this.playPauseVideo(event) } className={ 'HTML5StreamPlayer__playback-action-circle regular' }>
          <div className={ 'HTML5StreamPlayer__replay-icon-container' }>
            <span className={ 'HTML5StreamPlayer__playback-action-icon darkgrey icon icon-replay' } />
          </div>
        </div>
      );
    }

    let play_pause_vector_to;
    let play_pause_vector_from;

    if (this.state.wasPlaying === null) {
      play_pause_vector_to = vector_path_pause_icon;
      play_pause_vector_from = vector_path_pause_icon;
    } else if (this.state.wasPlaying === false) {
      play_pause_vector_to = vector_path_play_icon;
      play_pause_vector_from = vector_path_pause_icon;
    } else if (this.props.isGif === false) {
      play_pause_vector_to = vector_path_pause_icon;
      play_pause_vector_from = vector_path_play_icon;
    } else {
      return null;
    }

    return (
      <button
        className={ 'HTML5StreamPlayer__playback-action-circle regular' }
        onClick = { (event) => this.playPauseVideo(event) }
      >
        <svg className={ 'HTML5StreamPlayer__play-icon-container' }>
          <path className={ 'HTML5StreamPlayer__play-icon' } d={ play_pause_vector_to }>
            <animate
              ref = { (ref) => { this.playPauseAnimation = ref; } }
              begin="indefinite"
              attributeType="XML"
              attributeName="d"
              fill="freeze"
              to={ play_pause_vector_to }
              from={ play_pause_vector_from }
              dur = "0.2s"
              keySplines =".4 0 1 1"
              repeatCount={ 1 }
            >
            </animate>
          </path>
        </svg>
      </button>
    );
  }

  setVideoPos = (event) => {
    const video = this.scrubberThumbnail;
    const mainVideo = this.HTML5StreamPlayerVideo;
    const bufferBar = this.scrubBuffer;
    const tapPosition = this.calculateTapPosition(event.touches[0].pageX);

    if (video) {
      //kDuration is not exact but if the video is not loaded it prevents us from getting errors
      const duration = mainVideo.duration ? mainVideo.duration : this.props.kDuration;
      video.currentTime = Math.min(this.safeVideoTime(duration * tapPosition), this.props.kDuration);
    }

    this.setState({
      scrubPosition: tapPosition,
      thumbPosition: ((bufferBar.clientWidth-16) * tapPosition + 2),
      currentTime: this.secondsToMinutes(this.safeVideoTime(mainVideo.duration) * tapPosition),
    });
  }

  drawBufferBar(video = null) {
    //no bufferbar for gifs
    if (this.props.isGif) {
      return;
    }

    const bufferBar = this.scrubBuffer;
    const context = bufferBar.getContext('2d');

    //Bufferbar height needs to be set to clientHeight on initial load to prevent blending glitches from canvas stretching (safari).
    if (video === null) {
      bufferBar.height = bufferBar.clientHeight;
    }

    context.fillStyle = '#CCCCCA';
    context.fillRect(0, 0, bufferBar.width, bufferBar.height);

    if (video) {
      context.fillStyle = '#939393';
      context.strokeStyle = '#939393';

      const inc = bufferBar.width / video.duration;
      
      //draw buffering each update
      for (let i = 0; i < video.buffered.length; i++) {
        const startX = video.buffered.start(i) * inc;
        const endX = video.buffered.end(i) * inc;
        const width = endX - startX;

        context.fillRect(startX, 0, width, bufferBar.height);
        context.stroke();
      }
      
      context.fillStyle = '#0DD3BB';
      context.strokeStyle = '#0DD3BB';
      context.fillRect(0, 0, video.currentTime * inc, bufferBar.height);
    }
  }

  updateTime = () => {
    //Create buffer bar for data
    const video = this.HTML5StreamPlayerVideo;
    this.drawBufferBar(video);

    if (this.state.currentlyScrubbing === true) {
      return;
    }

    let newTime = this.state.totalServedTime;
    if ((this.state.lastUpdate !== null)
      && (this.videoIsPaused() === false)
      && (this.state.wasPlaying === true)) {
      newTime += performance.now() - this.state.lastUpdate;
    }

    if (video.ended && this.state.controlsHidden === true) {
      if (this.state.controlsHidden === true) {
        this.toggleControls();
      }
      clearTimeout(this.state.controlTimeout);
    }

    if (video.currentTime !== null && video.duration !== null) {
      this.setState({
        currentTime: this.secondsToMinutes(this.safeVideoTime(video.currentTime)),
        lastUpdate: performance.now(),
        totalServedTime: newTime,
        wasPlaying: !this.videoIsPaused(),
      });
      this.props.onUpdatePostPlaytime(video.currentTime);
    }
  }

  renderThumbnail() {

    return (
      <div className = { this.state.currentlyScrubbing ?
        'HTML5StreamPlayer__control__thumbContainer'
        :'HTML5StreamPlayer__control__scrubThumbHidden' }>
        <div
          style = { { left: isNaN(this.state.thumbPosition) ? 0 : this.state.thumbPosition } }
          className = { 'HTML5StreamPlayer__control__scrubThumb' }
        >
          <video
            className = { 'HTML5StreamPlayer__control__scrubVideo' }
            preload = 'metadata'
            autoPlay = { false }
            playsInline = { true }
            muted = { true }
            ref = { (ref) => { this.scrubberThumbnail = ref; } }
          >
            <source src={ this.props.scrubberThumbSource } type={ 'video/mp4' }/>
          </video>
        </div>
      </div>
    );  
  }

  scrubEnd = () => {
    //If scrubbing was voided due to toggle controls, we don't want to handle the scrub
    if (this.state.currentlyScrubbing === false) {
      return;
    }

    const video = this.HTML5StreamPlayerVideo;
    const videoThumb = this.scrubberThumbnail;
    videoThumb.pause();
    if (videoThumb.currentTime >= 0) {
      const duration = video.duration ? video.duration : this.props.kDuration;
      video.currentTime = Math.min(this.safeVideoTime(videoThumb.currentTime), duration);
    }

    //Mobile web is very poor at recognizing the 'end' of a video when scrubbed
    //Manually resuming if seeked to end will ensure replay icon displays
    if (this.state.scrubPosition === 1.0
      || (this.state.wasPlaying && (this.safeVideoTime(video.currentTime) < this.safeVideoTime(video.duration)))) {
      video.play();
    }


    if (video.currentTime !== null && video.duration !== null) {
      this.setState({
        currentlyScrubbing: false,
      });
    }

    //Create buffer bar for data
    this.startToggleControlsTimer();
    this.drawBufferBar(video);
    this.sendTrackVideoEvent(VIDEO_EVENT.SEEK);
  }

  calculateTapPosition(value) {
    const bufferBar = this.scrubBuffer;
    let tapPosition = ((value - (bufferBar.getBoundingClientRect().left)) / (bufferBar.clientWidth));
    tapPosition = Math.min(Math.max(tapPosition, 0.0), 1.0);

    return tapPosition;
  }

  scrubStart = (event) => {
    if (this.state.controlsHidden === true) {
      this.toggleControls();
      return;
    }
    clearTimeout(this.state.controlTimeout);

    const videoThumb = this.scrubberThumbnail;
    const bufferBar = this.scrubBuffer;
    const video = this.HTML5StreamPlayerVideo;

    const tapPosition = this.calculateTapPosition(event.touches[0].pageX);

    video.pause();

    if (videoThumb) {
      videoThumb.currentTime = this.safeVideoTime(videoThumb.duration) * tapPosition;
    }

    this.setState({
      scrubPosition: tapPosition,
      thumbPosition: ((bufferBar.clientWidth-16) * tapPosition + 2),
      currentlyScrubbing: true,
      currentTime: this.secondsToMinutes(this.safeVideoTime(video.duration) * tapPosition),
    });
  }

  renderSeekThumb = () => {
    const video = this.HTML5StreamPlayerVideo;
    const bufferBar = this.scrubBuffer;

    let videoPos = 0;
    if (bufferBar && this.state.currentlyScrubbing === false && video !== null) {
      videoPos = ((bufferBar.clientWidth - 16.0) * (this.safeVideoTime(video.currentTime)/this.safeVideoTime(video.duration)));
    } else if (bufferBar) {
      videoPos = (this.state.scrubPosition * (bufferBar.clientWidth - 16.0));
    }

    return (
      <div
        style = { { left: isNaN(videoPos) ? 0 :videoPos } }
        ref = { (ref) => { this.seekThumb = ref; } }
        className = 'HTML5StreamPlayer__control__seekThumb'
      >
      </div>
    );
  }

  render() {
    const controlsClass = 'HTML5StreamPlayer__controlPanel' + (this.state.controlsHidden === true ? ' hide' : ' show');

    return (
      <div className = { 'HTML5StreamPlayer' } ref = { (ref) => { this.HTML5StreamPlayerContainer = ref; } }>
        <div
          className = { this.state.videoFullScreen ?
            'HTML5StreamPlayer__videoContainer__fullscreen'
            :'HTML5StreamPlayer__videoContainer' }
        >
          <div
            className = { `HTML5StreamPlayer__videoTrim
              ${this.state.videoFullScreen ?
                '' : this.props.aspectRatioClassname
              }`
            }
          >
            <video
              loop={ this.props.isGif }
              autoPlay={ false }
              muted={ this.state.videoMuted }
              onTimeUpdate={ this.updateTime }
              poster={ this.props.posterImage }
              preload='none'
              playsInline={ true }
              className = { this.state.videoFullScreen ?
                'HTML5StreamPlayer__video__fullscreen'
                : 'HTML5StreamPlayer__video__regular' }
              ref = { (ref) => { this.HTML5StreamPlayerVideo = ref; } }
              data-dashjs-player
            >
              <source src={ this.props.hlsSource } type={ 'application/vnd.apple.mpegURL' }/>
              <source src={ this.props.mpegDashSource } type={ 'application/dash+xml' }/>
            </video>
          </div>

          { (this.state.isLoading === true && this.state.videoLoaded === false) &&
            <div className="HTML5StreamPlayer__buffering-controls">
              <div className="centered horizontal">
                <div className="buffering-indicator active">
                  <div className="spinner-layer">
                    <div className="circle-clipper left">
                      <div className="circle"></div>
                    </div>
                    <div className="gap-patch">
                      <div className="circle"></div>
                    </div>
                    <div className="circle-clipper right">
                      <div className="circle"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
          
          <div
            ref = { (ref) => { this.videoControls = ref; } }
            className = { controlsClass }
            id='html5-video-stream-controls'
          >
            <div className = 'HTML5StreamPlayer__control__play'>
              <div
                className = { 'HTML5StreamPlayer__control__play' }
                onClick = { this.toggleControls }
              >
                { this.state.videoLoaded && this.renderPlaybackIcon() }
              </div>
            </div>

            <div className = 'HTML5StreamPlayer__control__bar'>

              { !this.props.isGif &&
                <div className = 'HTML5StreamPlayer__control__fullscreen'>
                  <button
                    className = 'HTML5StreamPlayer__control__button'
                    onClick={ this.state.videoFullScreen ?
                      this.exitFullscreen
                      : this.enterFullScreen
                    }
                  >
                    <span
                      className = { this.state.videoFullScreen ?
                        'HTML5StreamPlayer__playback-full-screen-collapse icon icon-full-screen-collapse'
                        : 'HTML5StreamPlayer__playback-full-screen icon icon-full-screen'
                      }
                    />
                  </button>
                </div>
              }

              <div className = 'HTML5StreamPlayer__control__mute'>
                <button className = 'HTML5StreamPlayer__control__button' onClick = { this.muteVideo }>
                  { this.renderMute() }
                </button>
              </div>

              { !this.props.isGif &&
              <div className = 'HTML5StreamPlayer__control__scrubberContainer'>
                <div className = 'HTML5StreamPlayer__control__barMargin'>    
                  <div className = 'HTML5StreamPlayer__control__timeTotal'>
                    { this.state.totalTime }  
                  </div>

                  <div className = 'HTML5StreamPlayer__control__timeCurrent'>
                    { this.state.currentTime }
                  </div>

                  <div className = 'HTML5StreamPlayer__control__scrubBar__buffer__container'>
                    <canvas
                      ref = { (ref) => { this.scrubBuffer = ref; } }
                      className = { 'HTML5StreamPlayer__control__scrubBar__buffer' }
                    >
                    </canvas>
                    { this.renderSeekThumb() }
                  </div>

                  { this.renderThumbnail() }
                </div>
              </div>
              }
            </div>
          </div>
        </div>
      </div>
    );
  }

  buildBaseEventData() {
    const video = this.HTML5StreamPlayerVideo;
    const { postData, isVertical, isGif } = this.props;

    let currentTime = 0;
    let durationTime = 0;
    let pageType = this.state.videoFullScreen ? 'full_screen' : 'listing';

    if (video) {
      currentTime = parseInt(video.currentTime * 1000);
      durationTime = parseInt(video.duration * 1000);

      if (isCommentsPage(this.props.currentPage) === true) {
        pageType = 'comments';
      }
    }

    let subredditShortID = postData.subredditId;
    //Should always be greater than 3 but just incase.
    if (subredditShortID.length > 3) {
      subredditShortID = subredditShortID.substring(3,(subredditShortID.length - 3));
    }

    const mediaId = postData.cleanUrl.split('/').slice(-1)[0];

    const payload = {
      video_time: currentTime,
      video_duration: durationTime,
      vertical: isVertical,
      nsfw: postData.over18,
      spoiler: postData.spoiler,
      app_name: 'mweb',
      target_fullname: postData.uuid,
      target_author_id: parseInt(postData.author, 36),
      target_author_name: postData.author,
      target_created_ts: postData.createdUTC,
      target_id: parseInt(postData.id, 36),
      media_id: mediaId,
      target_url: postData.cleanUrl,
      target_url_domain: postData.domain,
      target_type: (isGif ? 'gif':'video'),
      sr_name: postData.subreddit,
      sr_fullname: postData.subredditId,
      sr_id: parseInt(subredditShortID, 36),
      page_type: pageType,
    };

    return payload;
  }

  sendTrackVideoEvent(eventType, optionalParams={}) {
    const payload = {
      ...this.buildBaseEventData(),
      ...optionalParams,
    };
    this.props.dispatch(trackVideoEvent(eventType,payload));
  }

  getPercentServed() {
    const video = this.HTML5StreamPlayerVideo;
    let pctServed = 0;
    if (video) {
      let servedTime = this.state.totalServedTime;

      //If we have no served time, video has just loaded (page change etc.) take currentTime as backup.
      if (servedTime === 0) {
        servedTime = video.currentTime;
      }
      pctServed = servedTime / parseInt(video.duration * 1000);
    }
    const payload = {
      max_timestamp_served: parseInt(this.state.totalServedTime),
      percent_served: pctServed,
    };

    return payload;
  }
}

const mapStateToProps = createSelector(
  state => state.platform.currentPage,
  (currentPage) => {
    return { currentPage };
  },
);

export default connect(mapStateToProps)(HTML5StreamPlayer);
