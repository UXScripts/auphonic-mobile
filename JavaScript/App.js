var Core = require('Core');
var Class = Core.Class;
var Element = Core.Element;
var Browser = Core.Browser;

var Handlebars = require('Handlebars');
require('Templates');

// Load PowerTools! Extensions
require('Class-Extras');
require('Custom-Event');
require('Mobile');

// Load Extensions
require('Extensions/Array');
require('Extensions/Element');
require('Extensions/HandlebarsHelper');
require('Extensions/Transition');
require('Extensions/Slick');
require('Extensions/Object');

// Dev Environment setup
require('Dev');

// Set up Formatters
require('App/Data');
require('App/OutgoingService');

// Load Controllers
require('Controller/Login');
require('Controller/Preset');
require('Controller/Production');
require('Controller/Recording');
require('Controller/Settings');

var History = require('History');
var Form = require('Form');
var LocalStorage = require('Utility/LocalStorage');
var ActiveState = require('Browser/ActiveState');
var PreventClickOnScroll = require('Browser/PreventClickOnScroll');

var API = require('API');
var UI = require('UI');
var View = require('View');
var Controller = require('Controller');
var AudioPlayer = require('App/AudioPlayer');
var SwipeAble = require('UI/Actions/SwipeAble');
var Popover = require('UI/Actions/Popover');
var Notice = require('UI/Notice');
var Spinner = require('Spinner');

var Auphonic = require('Auphonic');

// Register Partials for Handlebars
Handlebars.registerPartial('preset', Handlebars.templates.preset);
Handlebars.registerPartial('production', Handlebars.templates.production);

// Monkey Patch for Cordova which sometimes adds file:///
var getPath = History.getPath;
History.getPath = function() {
  return '/' + getPath.call(this).replace(/^\/|^file\:\/\/\//, '');
};

var preventDefault = function(event) {
  event.preventDefault();
};

var popoverSelector = 'div.popover';
var click = function(event) {
  event.preventDefault();
  var href = this.get('href');

  if (!href) return;
  if (event.touches && event.touches.length > 1) return;
  if (UI.isHighlighted(this)) {
    if (!this.getParent('footer')) return;

    // Tap on footer icon
    if (History.getPath() == href) {
      // Invalidate and rename stack to force re-evaluation
      View.getMain().getCurrentObject().invalidate();
      View.getMain().getStack().setName('default');
    }
  }

  if (!this.getParent(popoverSelector))
    UI.highlight(this);

  History.push(href);
};

var clickExternal = function(event) {
  event.preventDefault();
  var href = this.get('href');
  window.location.href = href + (~href.indexOf('#') ? '' : '#') + '!external';
};

var onLabelClick = function() {
  var input = this.getElement('input, select');
  if (input) input.focus();
};

var onDeleteClick = function(event) {
  if (event) event.preventDefault();

  removeItem(Popover.getBaseElement(this.getParent(popoverSelector)));
};

var removeItem = function(element) {
  element.addClass('fade');
  (function() {
    element.addEvent('transitionComplete:once', function() {
      this.destroy();
    }).addClass('out');
  }).delay(10);

  var url = element.get('data-api-url');
  var method = element.get('data-method');
  if (url && method) API.call(url, method);
};

// Make the info API calls and show the UI on success, or else provide a reload button
var infoURLs = ['algorithms', 'output_files', 'service_types'];
var spinner;
var isLoggedIn = !!LocalStorage.get('User');
var loaded = 0;
var load = function(event) {
  isLoggedIn = !!LocalStorage.get('User');
  if (loaded == infoURLs.length) {
    UI.showChrome();
    return;
  }

  if (event) event.preventDefault();

  var retry = document.id('retry');
  if (retry) retry.hide();

  if (!spinner) spinner = new Spinner(Auphonic.SpinnerOptions);
  if (isLoggedIn) spinner.spin(document.id('splash'));

  loaded = 0;
  infoURLs.each(function(info) {
    API.cacheInfo(info, {
      silent: !isLoggedIn
    }).on({
      success: function() {
        if (++loaded < infoURLs.length || !isLoggedIn) return;

        spinner.stop();
        Notice.closeAll();
        UI.showChrome();
        History.push('/');
      },
      error: function() {
        spinner.stop();
        var retry = document.id('retry').show();
        retry.getElement('a').addEvent('click', load);
      }
    });
  });
};

load();

// This is a lot of glue code !
var boot = function() {
  var activeState = (new ActiveState({
    active: 'active',
    hit: 'hit',
    hitProperty: 'data-hit-target'
  }));
  activeState.attach();

  if (Browser.Platform.ios) {
    (new PreventClickOnScroll({
      selector: 'div.scrollable',
      contentSelector: 'div.scroll-content',
      activeState: activeState
    })).attach();

    // Prevent all clicks from working normally
    window.addEventListener('click', preventDefault, false);
  }

  UI.register({

    '#main a:external, a.register': function(elements) {
      elements.addEvent('click', clickExternal);
    },

    '#main a:internal': function(elements) {
      elements.addEvent('click', click);
    },

    'footer a:internal': function(elements) {
      elements.addEvents({
        touchstart: click,
        click: preventDefault
      });
    },

    'a.deleteable': function(elements) {
      elements.addEvent('click', onDeleteClick);
    },

    'label.info, .show-popover': Class.Instantiate(Popover, {
      selector: popoverSelector,
      scrollSelector: 'div.scrollable',
      positionProperty: 'data-position',
      eventProperty: 'data-popover-event',
      animationClass: 'fade',
      arrowHeight: 14
    }),

    'textarea.autogrow': Class.Instantiate(Form.AutoGrow, {
      margin: 12
    }),

    'div.checkbox': Class.Instantiate(Form.Checkbox),

    'select.empty': Class.Instantiate(Form.EmptySelect, {
      placeholderPosition: '!',
      placeholder: '.placeholder',
    }),

    '.swipeable': Class.Instantiate(SwipeAble, {

      selector: '.removable > span',
      scrollableSelector: 'div.scrollable',

      onClick: function() {
        removeItem(this.container);
      },

      onSwipe: function() {
        this.container.getElement('> a').addClass('swiped');
      },

      onComplete: function() {
        this.container.getElement('> a').removeClass('swiped');
      }

    }),

    'label': function(elements) {
      elements.each(function(element) {
        element.onclick = onLabelClick;
      });
    },

    '.player': Class.Instantiate(AudioPlayer, {
      selector: '[data-media]',
      playSelector: 'a.play',
      waveformSelector: 'div.waveform',
      positionSelector: 'div.waveform div.position',

      onSetup: function() {
        View.getMain().getCurrentObject().addEvent('hide:once', this.bound('stop'));
      },

      onLoad: function() {
        View.getMain().showIndicator({
          immediate: true,
          stack: View.getMain().getStack().getName()
        });
      },

      onLoadFinished: function() {
        View.getMain().hideIndicator();
      }
    })

  }).update();

  Notice.setContainer(document.body)
    .setTemplate(new Element('div.notice').adopt(new Element('div.close'), new Element('div.text')));

  var notice;
  var noticeText;
  API.setErrorHandler(function(data) {
    var text = '';
    if (data && data.status_code) text = '<h1>An error occurred</h1> Please try again or report a bug so we can fix this as soon as possible.';
    else text = '<h1>A network error ocurred</h1> Please put your device in some elevated position to regain Internet access. If the problem lies on our end we\'ll make sure to fix the problem quickly :)';

    View.getMain().hideIndicator();

    // If the last notice with the same text is still visible we'll not show another one.
    if (notice && notice.isOpen() && noticeText == text) {
      notice.push();
      return;
    }

    noticeText = text;
    notice = new Notice(text, {type: 'error'});
  });

  UI.addEvents({
    enable: Popover.enable,
    disable: Popover.disable
  });

  var header = document.getElement('header');
  var back = new UI.BackButton(header, new Element('a'));
  var action = new UI.ActionButton(header, new Element('a'), {
    onClick: click
  });
  var title = new UI.Title(header, new Element('h1'));

  View.setMain(new View.Controller('main', {
    template: 'container-template',
    contentSelector: 'div.scroll-content',
    scrollableSelector: 'div.scrollable',

    back: back,
    title: title,
    action: action,
    indicatorOptions: Auphonic.ViewSpinnerOptions,
    smallIndicatorOptions: Auphonic.ViewSpinnerOptionsSmall,
    indicatorDelay: 500,

    onChange: function() {
      var stackName = this.getStack().getName();
      UI.highlight(document.getElement('footer .' + stackName));
    },

    onTransitionEnd: function() {
      var stack = this.getStack();
      var previous = stack && stack.getPrevious();
      if (previous)
        previous.toElement().getElements('ul li a.selected').removeClass('selected');
    }
  }));

  Controller.define('/', function() {
     // Call this so in case of a login with a failed attempt to load the infos we attempt to load them again.
     // It'll also take care of showing the UI.
    load();

    View.getMain().push('default', new View.Object({
      title: 'Home',
      content: UI.render('default')
    }));
  });

  if (!isLoggedIn) History.push('/login');
};

var fired;
var ready = function(){
  if (fired) return;
  fired = true;

  boot();
};

document.addEventListener('deviceready', ready, false);
window.addEventListener('DOMContentLoaded', ready, false);
