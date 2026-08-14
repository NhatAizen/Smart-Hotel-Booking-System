package com.smarthotel.identity.common.exception;

public class InvalidAccountTokenException
        extends RuntimeException {

    public InvalidAccountTokenException() {
        super("Token khÃ´ng há»£p lá»‡, Ä‘Ã£ Ä‘Æ°á»£c sá»­ dá»¥ng hoáº·c Ä‘Ã£ háº¿t háº¡n");
    }
}