TARGET := iphone:clang:latest:9.0
ARCHS := armv7

include /makefiles/common.mk

APPLICATION_NAME = CineStream
CineStream_FILES = main.m
CineStream_FRAMEWORKS = UIKit CoreGraphics WebKit Foundation
CineStream_CODESIGN_FLAGS = -Sentitlements.plist

include /application.mk
