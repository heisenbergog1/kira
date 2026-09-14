#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

@interface AppDelegate : UIResponder <UIApplicationDelegate, WKNavigationDelegate, UIWebViewDelegate>
@property (strong, nonatomic) UIWindow *window;
@property (strong, nonatomic) WKWebView *wkWebView;
@property (strong, nonatomic) UIWebView *uiWebView;
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]];
    UIViewController *rootVC = [[UIViewController alloc] init];
    rootVC.view.backgroundColor = [UIColor colorWithRed:0.06 green:0.07 blue:0.10 alpha:1.0];
    [[UIApplication sharedApplication] setStatusBarStyle:UIStatusBarStyleLightContent];
    
    CGRect webFrame = rootVC.view.bounds;
    NSString *htmlPath = [[NSBundle mainBundle] pathForResource:@"index" ofType:@"html" inDirectory:@"www"];
    NSURL *localURL = htmlPath ? [NSURL fileURLWithPath:htmlPath] : nil;
    
    if (NSClassFromString(@"WKWebView")) {
        WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
        config.allowsInlineMediaPlayback = YES;
        if ([config respondsToSelector:@selector(setRequiresUserActionForMediaPlayback:)]) {
            [config setRequiresUserActionForMediaPlayback:NO];
        }
        self.wkWebView = [[WKWebView alloc] initWithFrame:webFrame configuration:config];
        self.wkWebView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
        self.wkWebView.navigationDelegate = self;
        self.wkWebView.scrollView.bounces = NO;
        self.wkWebView.opaque = NO;
        self.wkWebView.backgroundColor = [UIColor clearColor];
        
        if (localURL) {
            NSURL *baseURL = [localURL URLByDeletingLastPathComponent];
            if ([self.wkWebView respondsToSelector:@selector(loadFileURL:allowingReadAccessToURL:)]) {
                [self.wkWebView loadFileURL:localURL allowingReadAccessToURL:baseURL];
            } else {
                NSString *htmlContent = [NSString stringWithContentsOfURL:localURL encoding:NSUTF8StringEncoding error:nil];
                [self.wkWebView loadHTMLString:htmlContent baseURL:baseURL];
            }
        }
        [rootVC.view addSubview:self.wkWebView];
    } else {
        self.uiWebView = [[UIWebView alloc] initWithFrame:webFrame];
        self.uiWebView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
        self.uiWebView.allowsInlineMediaPlayback = YES;
        self.uiWebView.mediaPlaybackRequiresUserAction = NO;
        self.uiWebView.scrollView.bounces = NO;
        if (localURL) {
            [self.uiWebView loadRequest:[NSURLRequest requestWithURL:localURL]];
        }
        [rootVC.view addSubview:self.uiWebView];
    }
    
    self.window.rootViewController = rootVC;
    [self.window makeKeyAndVisible];
    return YES;
}

@end

int main(int argc, char * argv[]) {
    @autoreleasepool {
        return UIApplicationMain(argc, argv, nil, NSStringFromClass([AppDelegate class]));
    }
}
