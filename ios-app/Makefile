TARGET := iphone:clang:9.3:9.0
ARCHS := armv7

include $(THEOS)/makefiles/common.mk

APPLICATION_NAME = CineStream
CineStream_FILES = main.m
CineStream_FRAMEWORKS = UIKit WebKit AVFoundation CoreGraphics Foundation
CineStream_CODESIGN_FLAGS = -Sentitlements.plist

include $(THEOS_MAKE_PATH)/application.mk
