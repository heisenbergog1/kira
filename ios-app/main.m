#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <AVFoundation/AVFoundation.h>

@interface CineStreamViewController : UIViewController <WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler>
@property (strong, nonatomic) WKWebView *webView;
@property (strong, nonatomic) UIActivityIndicatorView *spinner;
@property (nonatomic) BOOL isVideoFullscreen;
@end

@implementation CineStreamViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    
    // Set background color to match CineStream dark theme (#0f111a)
    self.view.backgroundColor = [UIColor colorWithRed:15.0/255.0 green:17.0/255.0 blue:26.0/255.0 alpha:1.0];
    
    // Enable background audio playback
    NSError *audioError = nil;
    [[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryPlayback error:&audioError];
    [[AVAudioSession sharedInstance] setActive:YES error:nil];
    
    // Setup WKWebView Configuration optimized for iPad Mini 1
    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    config.allowsInlineMediaPlayback = YES;
    
    // Configure media playback without user gesture requirement
    if ([config respondsToSelector:@selector(setRequiresUserActionForMediaPlayback:)]) {
        [config setRequiresUserActionForMediaPlayback:NO];
    }
    if ([config respondsToSelector:@selector(setMediaTypesRequiringUserActionForPlayback:)]) {
        [config setMediaTypesRequiringUserActionForPlayback:WKAudiovisualMediaTypeNone];
    }
    
    // Add Javascript bridge to communicate video state to native iOS
    WKUserContentController *userContent = [[WKUserContentController alloc] init];
    [userContent addScriptMessageHandler:self name:@"cineStreamNative"];
    
    // Inject optimization script for iPad Mini 1 Webview (Smooth scrolling & Fullscreen hook)
    NSString *optScript = @"\
        document.addEventListener('fullscreenchange', function() {\
            var isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);\
            window.webkit.messageHandlers.cineStreamNative.postMessage({action: 'fullscreen', value: isFS});\
        });\
        document.addEventListener('play', function(e) {\
            if (e.target.tagName === 'VIDEO') {\
                window.webkit.messageHandlers.cineStreamNative.postMessage({action: 'videoPlay'});\
            }\
        }, true);\
        document.addEventListener('pause', function(e) {\
            if (e.target.tagName === 'VIDEO') {\
                window.webkit.messageHandlers.cineStreamNative.postMessage({action: 'videoPause'});\
            }\
        }, true);\
    ";
    WKUserScript *script = [[WKUserScript alloc] initWithSource:optScript injectionTime:WKUserScriptInjectionTimeAtDocumentEnd forMainFrameOnly:NO];
    [userContent addUserScript:script];
    config.userContentController = userContent;
    
    // Initialize WKWebView
    self.webView = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:config];
    self.webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    self.webView.opaque = NO;
    self.webView.backgroundColor = [UIColor clearColor];
    self.webView.scrollView.bounces = NO;
    self.webView.scrollView.decelerationRate = UIScrollViewDecelerationRateNormal;
    [self.view addSubview:self.webView];
    
    // Add loading spinner
    self.spinner = [[UIActivityIndicatorView alloc] initWithActivityIndicatorStyle:UIActivityIndicatorViewStyleWhiteLarge];
    self.spinner.center = self.view.center;
    self.spinner.autoresizingMask = UIViewAutoresizingFlexibleLeftMargin | UIViewAutoresizingFlexibleRightMargin | UIViewAutoresizingFlexibleTopMargin | UIViewAutoresizingFlexibleBottomMargin;
    self.spinner.hidesWhenStopped = YES;
    [self.view addSubview:self.spinner];
    [self.spinner startAnimating];
    
    // Load local CineStream web bundle
    NSString *htmlPath = [[NSBundle mainBundle] pathForResource:@"index" ofType:@"html" inDirectory:@"www"];
    if (htmlPath) {
        NSURL *fileURL = [NSURL fileURLWithPath:htmlPath];
        NSURL *baseURL = [fileURL URLByDeletingLastPathComponent];
        if ([self.webView respondsToSelector:@selector(loadFileURL:allowingReadAccessToURL:)]) {
            [self.webView loadFileURL:fileURL allowingReadAccessToURL:baseURL];
        } else {
            NSString *content = [NSString stringWithContentsOfURL:fileURL encoding:NSUTF8StringEncoding error:nil];
            [self.webView loadHTMLString:content baseURL:baseURL];
        }
    } else {
        // Fallback to local server
        [self.webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"http://localhost:3000"]]];
    }
}

#pragma mark - Status Bar & Fullscreen Control (Hides Status Bar completely during video)

- (BOOL)prefersStatusBarHidden {
    // Hide status bar during video / fullscreen or permanently for full immersion
    return YES;
}

- (UIStatusBarAnimation)preferredStatusBarUpdateAnimation {
    return UIStatusBarAnimationFade;
}

- (BOOL)shouldAutorotate {
    return YES;
}

- (UIInterfaceOrientationMask)supportedInterfaceOrientations {
    return UIInterfaceOrientationMaskAllButUpsideDown;
}

#pragma mark - WKScriptMessageHandler (Receives events from CineStream web player)

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if ([message.body isKindOfClass:[NSDictionary class]]) {
        NSDictionary *dict = (NSDictionary *)message.body;
        NSString *action = dict[@"action"];
        if ([action isEqualToString:@"fullscreen"] || [action isEqualToString:@"videoPlay"]) {
            self.isVideoFullscreen = YES;
            [UIView animateWithDuration:0.3 animations:^{
                [self setNeedsStatusBarAppearanceUpdate];
            }];
        } else if ([action isEqualToString:@"videoPause"]) {
            self.isVideoFullscreen = NO;
            [UIView animateWithDuration:0.3 animations:^{
                [self setNeedsStatusBarAppearanceUpdate];
            }];
        }
    }
}

#pragma mark - WKNavigationDelegate

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    [self.spinner stopAnimating];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    [self.spinner stopAnimating];
}

#pragma mark - Memory Management for iPad Mini 1 (512MB RAM)

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Evict unused webview caches to prevent iOS from terminating the app
    [[NSURLCache sharedURLCache] removeAllCachedResponses];
}

@end

@interface AppDelegate : UIResponder <UIApplicationDelegate>
@property (strong, nonatomic) UIWindow *window;
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]];
    CineStreamViewController *vc = [[CineStreamViewController alloc] init];
    self.window.rootViewController = vc;
    [self.window makeKeyAndVisible];
    return YES;
}

@end

int main(int argc, char * argv[]) {
    @autoreleasepool {
        return UIApplicationMain(argc, argv, nil, NSStringFromClass([AppDelegate class]));
    }
}
